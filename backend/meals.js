const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Meal = require("./models/meal");

// --------------------- helpers ---------------------

function mongoReady() {
  return mongoose?.connection?.readyState === 1; // 1 = connected
}

// trova il primo percorso esistente per meals1.json
function resolveMealsFile() {
  const candidates = [
    process.env.MEALS_FILE,                                  // 1) variabile d'ambiente
    path.join(__dirname, "meals1.json"),                     // 2) stessa cartella del file
    path.join(process.cwd(), "meals1.json"),                 // 3) root del processo
    path.join(__dirname, "..", "meals1.json"),               // 4) una su
    path.join(__dirname, "../..", "meals1.json"),            // 5) due su
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return candidates[candidates.length - 1] || "meals1.json";
}

function readFileMeals() {
  const filePath = resolveMealsFile();
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { data: [], filePath, error: null, exists: false };
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw || "[]");
    return { data, filePath, error: null, exists: true };
  } catch (err) {
    return { data: [], filePath, error: String(err?.message || err), exists: false };
  }
}

function writeFileMeals(data, filePath) {
  const out = Array.isArray(data) ? data : [];
  fs.writeFileSync(filePath, JSON.stringify(out, null, 2), "utf8");
}

// riconosce “aspetto piatto”
function looksLikeMeal(o) {
  if (!o || typeof o !== "object") return false;
  return (
    "nome" in o || "name" in o || "strMeal" in o ||
    "tipologia" in o || "category" in o || "strCategory" in o
  );
}

// appiattisce sia struttura [{restaurantId, menu:[...]}, ...] sia lista di piatti top-level
function flattenFileMeals(data) {
  if (!Array.isArray(data)) return [];

  // caso A: array di piatti top-level
  if (data.length && looksLikeMeal(data[0])) {
    return data.map(m => ({ ...m }));
  }

  // caso B: array di ristoranti con menu
  const out = [];
  for (const r of data) {
    const menu = Array.isArray(r?.menu) ? r.menu : [];
    for (const m of menu) {
      out.push({ ...m, restaurantId: r.restaurantId ?? r.id ?? r._id });
    }
  }
  return out;
}

// ---------- normalizzazione + alias ingredienti ----------

function normalizeIngredients(obj) {
  if (Array.isArray(obj?.ingredienti)) {
    return obj.ingredienti.filter(Boolean).map(x => String(x).trim()).filter(Boolean);
  }
  const list = [];
  for (let i = 1; i <= 20; i++) {
    const ing = obj?.[`strIngredient${i}`];
    const meas = obj?.[`strMeasure${i}`];
    if (ing && String(ing).trim()) {
      list.push(meas ? `${meas} ${ing}`.trim() : String(ing).trim());
    }
  }
  if (!list.length && Array.isArray(obj?.ingredients)) {
    return obj.ingredients.filter(Boolean).map(x => String(x).trim()).filter(Boolean);
  }
  return list;
}

// restituisce un oggetto con ingredienti sempre presenti
function withIngredients(m) {
  const clone = { ...m };

  if (Array.isArray(clone.ingredienti)) {
    clone.ingredienti = clone.ingredienti.filter(Boolean).map(x => String(x).trim()).filter(Boolean);
    clone.ingredients  = clone.ingredienti.slice();
    clone.ingredient   = clone.ingredienti.join(", ");
    return clone;
  }

  if (Array.isArray(clone.ingredients)) {
    const arr = clone.ingredients.filter(Boolean).map(x => String(x).trim()).filter(Boolean);
    clone.ingredienti = arr;
    clone.ingredients  = arr.slice();
    clone.ingredient   = arr.join(", ");
    return clone;
  }

  const list = [];
  for (let i = 1; i <= 20; i++) {
    const ing  = clone[`strIngredient${i}`];
    const meas = clone[`strMeasure${i}`];
    if (ing && String(ing).trim()) {
      list.push(meas ? `${meas} ${ing}`.trim() : String(ing).trim());
    }
    delete clone[`strIngredient${i}`];
    delete clone[`strMeasure${i}`];
  }

  clone.ingredienti = list;
  clone.ingredients  = list.slice();
  clone.ingredient   = list.join(", ");
  return clone;
}

// --------------------- rotte ----------------------

// GET /meals/common-meals
// unisce piatti "comuni" da file + DB (dedup, priorità DB)
router.get("/common-meals", async (req, res) => {
  try {
    const source = String(req.query.source || "all").toLowerCase();
    const dedupMode = String(req.query.dedup || "perRestaurant").toLowerCase();

    // --- file ---
    let fileMeals = [];
    const { data, filePath, error, exists } = readFileMeals();
    if (source !== "db") {
      if (error && source === "file") {
        return res.status(500).json({ error: "Unable to read common dishes file", detail: error });
      }
      fileMeals = flattenFileMeals(data).map(withIngredients);
    }
    res.setHeader("X-Meals-File", filePath || "");
    res.setHeader("X-Meals-File-Exists", String(!!exists));
    res.setHeader("X-Meals-File-Count", String(fileMeals.length));

    // --- db ---
    let dbMeals = [];
    if (source !== "file" && mongoReady()) {
      dbMeals = await Meal
        .find({ $or: [{ isCommon: true }, { origine: "comune" }] })
        .lean();
      dbMeals = dbMeals.map(withIngredients);
      res.setHeader("X-Meals-DB-Count", String(dbMeals.length));
    } else if (source === "db" && !mongoReady()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    // --- unione + dedup ---
    const keyOf = (m) => {
      const id = m.idmeals ?? m.idMeal ?? m.id ?? m._id;
      if (id != null) return String(id).toLowerCase();

      const name = (m.nome || m.name || m.strMeal || "").toLowerCase().trim();
      const cat  = (m.tipologia || m.category || m.strCategory || "").toLowerCase().trim();
      const rid  = (m.restaurantId || "").toString().toLowerCase().trim();

      if (dedupMode === "off")     return `${Math.random()}|${name}|${cat}`;
      if (dedupMode === "global")  return `${name}|${cat}`;
      return rid ? `${rid}|${name}|${cat}` : `${name}|${cat}`;
    };

    const seen = new Set();
    const merged = [];
    for (const m of [...dbMeals, ...fileMeals]) {
      const k = keyOf(m);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(m);
      }
    }

    return res.json(merged);
  } catch (err) {
    console.error("Errore /meals/common-meals:", err);
    return res.status(500).json({ error: "Error in reading common dishes", detail: String(err?.message || err) });
  }
});

// post /meals — crea un piatto con fallback robusto (db se c'è, altrimenti file)
router.post("/", async (req, res) => {
  try {
    const b = req.body || {};

    if (!b.restaurantId) {
      return res.status(400).json({ error: "RestaurantId missing" });
    }

    const ingr = normalizeIngredients(b);
    const ingrArr = ingr.filter(Boolean).map(x => String(x).trim()).filter(Boolean);
    const ingrStr = ingrArr.join(", ");

    const newMeal = {
      restaurantId: b.restaurantId,
      nome: b.nome || b.name || b.strMeal || "Senza nome",
      tipologia: b.tipologia || b.category || b.strCategory || "Altro",
      prezzo: Number(b.prezzo ?? 0),
      foto: b.foto || b.image || b.strMealThumb || "",
      ingredienti: ingrArr,
      ingredients: ingrArr.slice(),
      ingredient: ingrStr,
      origine: b.origine || "personalizzato",
      isCommon: typeof b.isCommon === "boolean" ? b.isCommon : (b.origine === "comune")
    };

    for (let i = 1; i <= 20; i++) {
      delete newMeal[`strIngredient${i}`];
      delete newMeal[`strMeasure${i}`];
    }

    if (mongoReady()) {
      if (newMeal.idmeals == null) {
        const maxDoc = await Meal
          .findOne({ idmeals: { $ne: null } })
          .sort({ idmeals: -1 })
          .select("idmeals")
          .lean()
          .catch(() => null);

        const maxId = Number(maxDoc?.idmeals) || 0;
        newMeal.idmeals = maxId + 1;
      }
      newMeal.idmeals = Number(newMeal.idmeals);

      const created = await Meal.create(newMeal);
      return res.status(201).json(created);
    }

    // ---- fallback su file meals1.json ----
    const { data, filePath } = readFileMeals();
    const restaurants = Array.isArray(data) ? data : [];

    let rest = restaurants.find(r => String(r.restaurantId) === String(newMeal.restaurantId));
    if (!rest) {
      rest = { restaurantId: newMeal.restaurantId, menu: [] };
      restaurants.push(rest);
    }
    if (!Array.isArray(rest.menu)) rest.menu = [];

    const allMeals = restaurants.flatMap(r => Array.isArray(r.menu) ? r.menu : []);
    const maxId = allMeals.reduce((acc, m) => Math.max(acc, Number(m.idmeals || 0)), 0);
    newMeal.idmeals = maxId + 1;

    rest.menu.push(newMeal);
    writeFileMeals(restaurants, filePath);

    return res.status(201).json(newMeal);
  } catch (err) {
    console.error("POST /meals error:", err);
    return res.status(500).json({ error: "Error saving dish", detail: String(err?.message || err) });
  }
});

// ---- helpers cancellazione ----
function isHex24(s) {
  return typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
}

// delete /meals/:id — accetta sia ObjectId che idmeals numerico, con fallback file
router.delete("/:id", async (req, res) => {
  try {
    const raw = String(req.params.id);

    // --- mongodb ---
    if (mongoReady()) {
      // 1) prova con _id objectId
      if (isHex24(raw)) {
        const del = await Meal.deleteOne({ _id: raw });
        if (del.deletedCount > 0) return res.json({ ok: true, deleted: 1 });
      }
      // 2) prova con idmeals numerico
      const n = Number(raw);
      if (Number.isFinite(n)) {
        const del = await Meal.deleteOne({ idmeals: n });
        if (del.deletedCount > 0) return res.json({ ok: true, deleted: 1 });
      }
      // se non trovato in DB, continuo col file
    }

    // --- fallback su file: solo id numerico ---
    const id = Number(raw);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Id not valid" });
    }

    const { data, filePath } = readFileMeals();
    const restaurants = Array.isArray(data) ? data : [];

    let removed = 0;
    for (const r of restaurants) {
      if (!Array.isArray(r.menu)) continue;
      const idx = r.menu.findIndex(m => Number(m.idmeals) === id);
      if (idx >= 0) {
        r.menu.splice(idx, 1);
        removed = 1;
        break;
      }
    }

    if (removed) {
      writeFileMeals(restaurants, filePath);
      return res.json({ ok: true, deleted: 1 });
    } else {
      return res.status(404).json({ error: "dish not found" });
    }
  } catch (err) {
    console.error("DELETE /meals/:id error:", err);
    return res.status(500).json({ error: "Error during the deletingof the dish", detail: String(err?.message || err) });
  }
});

// (opzionale) delete /meals/:restaurantId/:id — compatibilità con frontend annidato
router.delete("/:restaurantId/:id", async (req, res) => {
  try {
    const rid = String(req.params.restaurantId);
    const raw = String(req.params.id);

    if (mongoReady()) {
      if (isHex24(raw)) {
        const del = await Meal.deleteOne({ _id: raw, restaurantId: rid });
        if (del.deletedCount > 0) return res.json({ ok: true, deleted: 1 });
      }
      const n = Number(raw);
      if (Number.isFinite(n)) {
        const del = await Meal.deleteOne({ restaurantId: rid, idmeals: n });
        if (del.deletedCount > 0) return res.json({ ok: true, deleted: 1 });
      }
      // se non trovato, passo al file
    }

    // fallback file (serve id numerico)
    const id = Number(raw);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Id not valid" });
    }

    const { data, filePath } = readFileMeals();
    const restaurants = Array.isArray(data) ? data : [];
    const rest = restaurants.find(r => String(r.restaurantId) === rid);
    if (!rest || !Array.isArray(rest.menu)) {
      return res.status(404).json({ error: "Restaurant or menu' not found" });
    }
    const idx = rest.menu.findIndex(m => Number(m.idmeals) === id);
    if (idx < 0) return res.status(404).json({ error: "Dish not found" });

    rest.menu.splice(idx, 1);
    writeFileMeals(restaurants, filePath);
    return res.json({ ok: true, deleted: 1 });
  } catch (err) {
    console.error("DELETE /meals/:restaurantId/:id error:", err);
    return res.status(500).json({ error: "Error during the deletingof the dish", detail: String(err?.message || err) });
  }
});

// get /meals — lista ristoranti con menu (DB se c'è, altrimenti file)
router.get("/", async (req, res) => {
  try {
    const wantedRid = req.query.restaurantId ? String(req.query.restaurantId) : null;

    // --- db ---
    if (mongoReady()) {
      const query = wantedRid ? { restaurantId: wantedRid } : {};
      const docs = await Meal.find(query).lean();
      const meals = docs.map(withIngredients);

      // raggruppo per restaurantId
      const byRid = {};
      for (const m of meals) {
        const rid = String(m.restaurantId || "");
        if (!byRid[rid]) byRid[rid] = { restaurantId: rid, menu: [] };
        byRid[rid].menu.push(m);
      }
      return res.json(Object.values(byRid));
    }

    // --- fallback file ---
    const { data } = readFileMeals();

    if (Array.isArray(data) && data.length && (data[0].menu || data[0].restaurantId)) {
      const shaped = data.map(r => ({
        restaurantId: r.restaurantId ?? r.id ?? r._id ?? "",
        menu: Array.isArray(r.menu) ? r.menu.map(withIngredients) : []
      }));
      return res.json(
        wantedRid ? shaped.filter(r => String(r.restaurantId) === wantedRid) : shaped
      );
    }

    const flat = flattenFileMeals(data).map(withIngredients);
    const byRid = {};
    for (const m of flat) {
      const rid = String(m.restaurantId || "");
      if (wantedRid && rid !== wantedRid) continue;
      if (!byRid[rid]) byRid[rid] = { restaurantId: rid, menu: [] };
      byRid[rid].menu.push(m);
    }
    return res.json(Object.values(byRid));
  } catch (err) {
    console.error("GET /meals error:", err);
    res.status(500).json({ error: "Error during the loading of the menu'", detail: String(err?.message || err) });
  }
});

module.exports = router;
