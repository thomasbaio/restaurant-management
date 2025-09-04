const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Meal = require("./models/meal");

// --------------------- Helpers ---------------------

function mongoReady() {
  return mongoose?.connection?.readyState === 1; // 1 = connected
}

// Trova il primo percorso esistente per meals1.json
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

// Riconosce “aspetto piatto”
function looksLikeMeal(o) {
  if (!o || typeof o !== "object") return false;
  return (
    "nome" in o || "name" in o || "strMeal" in o ||
    "tipologia" in o || "category" in o || "strCategory" in o
  );
}

// Appiattisce sia struttura [{restaurantId, menu:[...]}, ...] sia lista di piatti top-level
function flattenFileMeals(data) {
  if (!Array.isArray(data)) return [];

  // Caso A: array di piatti top-level
  if (data.length && looksLikeMeal(data[0])) {
    return data.map(m => ({ ...m }));
  }

  // Caso B: array di ristoranti con menu
  const out = [];
  for (const r of data) {
    const menu = Array.isArray(r?.menu) ? r.menu : [];
    for (const m of menu) {
      out.push({ ...m, restaurantId: r.restaurantId ?? r.id ?? r._id });
    }
  }
  return out;
}

// ---------- Normalizzazione + alias ingredienti ----------

// Normalizza gli ingredienti in array canonico "ingredienti"
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

// Restituisce un oggetto con ingredienti sempre presenti come:
// - ingredienti: array
// - ingredients: array (alias)
// - ingredient:  string (comma-separated)
function withIngredients(m) {
  const clone = { ...m };

  // Se già presenti
  if (Array.isArray(clone.ingredienti)) {
    clone.ingredienti = clone.ingredienti.filter(Boolean).map(x => String(x).trim()).filter(Boolean);
    clone.ingredients  = clone.ingredienti.slice();
    clone.ingredient   = clone.ingredienti.join(", ");
    return clone;
  }

  // Alias da "ingredients"
  if (Array.isArray(clone.ingredients)) {
    const arr = clone.ingredients.filter(Boolean).map(x => String(x).trim()).filter(Boolean);
    clone.ingredienti = arr;
    clone.ingredients  = arr.slice();
    clone.ingredient   = arr.join(", ");
    return clone;
  }

  // Estrazione stile TheMealDB con pulizia campi
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

// --------------------- Rotte ----------------------

// GET /meals/common-meals
// Unisce piatti "comuni" da file + DB (dedup, priorità DB)
// Query: ?source=file|db|all  ?dedup=global|perRestaurant|off
router.get("/common-meals", async (req, res) => {
  try {
    const source = String(req.query.source || "all").toLowerCase();
    const dedupMode = String(req.query.dedup || "perRestaurant").toLowerCase();

    // --- File ---
    let fileMeals = [];
    const { data, filePath, error, exists } = readFileMeals();
    if (source !== "db") {
      if (error && source === "file") {
        return res.status(500).json({ error: "Impossibile leggere il file dei piatti comuni", detail: error });
      }
      fileMeals = flattenFileMeals(data).map(withIngredients);
    }
    res.setHeader("X-Meals-File", filePath || "");
    res.setHeader("X-Meals-File-Exists", String(!!exists));
    res.setHeader("X-Meals-File-Count", String(fileMeals.length));

    // --- DB ---
    let dbMeals = [];
    if (source !== "file" && mongoReady()) {
      dbMeals = await Meal
        .find({ $or: [{ isCommon: true }, { origine: "comune" }] })
        .lean();
      dbMeals = dbMeals.map(withIngredients);
      res.setHeader("X-Meals-DB-Count", String(dbMeals.length));
    } else if (source === "db" && !mongoReady()) {
      return res.status(503).json({ error: "Database non connesso" });
    }

    // --- Unione + dedup ---
    const keyOf = (m) => {
      const id = m.idmeals ?? m.idMeal ?? m.id ?? m._id;
      if (id != null) return String(id).toLowerCase();

      const name = (m.nome || m.name || m.strMeal || "").toLowerCase().trim();
      const cat  = (m.tipologia || m.category || m.strCategory || "").toLowerCase().trim();
      const rid  = (m.restaurantId || "").toString().toLowerCase().trim();

      if (dedupMode === "off")     return `${Math.random()}|${name}|${cat}`;
      if (dedupMode === "global")  return `${name}|${cat}`;
      return rid ? `${rid}|${name}|${cat}` : `${name}|${cat}`; // default per ristorante
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
    return res.status(500).json({ error: "Errore nella lettura dei piatti comuni", detail: String(err?.message || err) });
  }
});

// ✅ POST /meals — crea un piatto con fallback robusto (DB se c'è, altrimenti file)
// Include normalizzazione + alias ingredienti prima del salvataggio
router.post("/", async (req, res) => {
  try {
    const b = req.body || {};

    if (!b.restaurantId) {
      return res.status(400).json({ error: "restaurantId mancante" });
    }

    // Ingredienti canonici + alias (indipendenti da come li manda il frontend)
    const ingr = normalizeIngredients(b);
    const ingrArr = ingr.filter(Boolean).map(x => String(x).trim()).filter(Boolean);
    const ingrStr = ingrArr.join(", ");

    // Mappatura campi “elastici”
    const newMeal = {
      restaurantId: b.restaurantId,
      nome: b.nome || b.name || b.strMeal || "Senza nome",
      tipologia: b.tipologia || b.category || b.strCategory || "Altro",
      prezzo: Number(b.prezzo ?? 0),
      foto: b.foto || b.image || b.strMealThumb || "",
      ingredienti: ingrArr,                 // canonico
      ingredients: ingrArr.slice(),         // alias array
      ingredient: ingrStr,                  // alias stringa
      origine: b.origine || "personalizzato",
      isCommon: typeof b.isCommon === "boolean" ? b.isCommon : (b.origine === "comune")
    };

    // Pulizia eventuali campi temporanei stile TheMealDB (se arrivano nel body)
    for (let i = 1; i <= 20; i++) {
      delete newMeal[`strIngredient${i}`];
      delete newMeal[`strMeasure${i}`];
    }

    // ---- Salvataggio preferendo MongoDB ----
    if (mongoReady()) {
      const created = await Meal.create(newMeal);
      return res.status(201).json(created);
    }

    // ---- Fallback su file meals1.json ----
    const { data, filePath } = readFileMeals();
    const restaurants = Array.isArray(data) ? data : [];

    // Trova o crea il ristorante
    let rest = restaurants.find(r => String(r.restaurantId) === String(newMeal.restaurantId));
    if (!rest) {
      rest = { restaurantId: newMeal.restaurantId, menu: [] };
      restaurants.push(rest);
    }
    if (!Array.isArray(rest.menu)) rest.menu = [];

    // Genera idmeals progressivo
    const allMeals = restaurants.flatMap(r => Array.isArray(r.menu) ? r.menu : []);
    const maxId = allMeals.reduce((acc, m) => Math.max(acc, Number(m.idmeals || 0)), 0);
    newMeal.idmeals = maxId + 1;

    // Inserisci e salva
    rest.menu.push(newMeal);
    writeFileMeals(restaurants, filePath);

    return res.status(201).json(newMeal);
  } catch (err) {
    console.error("POST /meals error:", err);
    return res.status(500).json({ error: "Errore nel salvataggio del piatto", detail: String(err?.message || err) });
  }
});

module.exports = router;
