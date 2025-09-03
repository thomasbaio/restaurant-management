const express = require("express");
const router = express.Router();
const Meal = require("./models/meal"); // backend/models/meal.js (minuscolo)
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// ===== FILE di fallback: è in backend/meals1.json =====
const DATA_FILE = path.join(__dirname, "meals1.json");
function readFileMeals() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { data: [], path: null };
    const json = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { data: Array.isArray(json) ? json : [], path: DATA_FILE };
  } catch (e) {
    console.error("readFileMeals error:", e.message, "FILE:", DATA_FILE);
    return { data: [], path: DATA_FILE, error: e.message };
  }
}
function mongoReady() {
  return mongoose.connection && mongoose.connection.readyState === 1; // 1=connected
}

// ---------- Helpers ----------
function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function extractIngredients(obj) {
  if (Array.isArray(obj.ingredienti) && obj.ingredienti.length) {
    return obj.ingredienti.filter(Boolean).map(String);
  }
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const k = `strIngredient${i}`;
    if (obj[k] && String(obj[k]).trim()) {
      out.push(String(obj[k]).trim());
      delete obj[k];
    }
  }
  return out;
}
async function nextMealId() {
  const last = await Meal.findOne().sort({ idmeals: -1 }).select("idmeals").lean();
  return (last?.idmeals || 0) + 1;
}
function sanitizePayload(payload, { isUpdate = false } = {}) {
  const p = { ...payload };
  if (!p.immagine && p.foto) p.immagine = p.foto;
  if (p.prezzo !== undefined) {
    const n = toNumber(p.prezzo);
    if (n === undefined) throw new Error("prezzo non numerico");
    p.prezzo = n;
  }
  const ing = extractIngredients(p);
  if (ing.length) p.ingredienti = ing;
  if (!isUpdate && !p.origine) p.origine = "personalizzato";
  if (isUpdate) delete p.idmeals;
  return p;
}

// ---------- Rotte ----------

// Sorgente corrente (debug)
router.get("/_debug-source", async (_req, res) => {
  let source = "file";
  let count = 0;

  if (mongoReady()) {
    try {
      count = await Meal.countDocuments();
      if (count > 0) source = "mongo";
    } catch {}
  }
  if (source !== "mongo") {
    const { data, path } = readFileMeals();
    count = data.length;
    source = path ? `file:${path}` : "none";
  }
  res.json({ source, count });
});

// Piatti comuni
router.get("/common-meals", async (_req, res) => {
  try {
    if (mongoReady()) {
      const common = await Meal.find({ $or: [{ isCommon: true }, { origine: "comune" }] }).lean();
      if (common.length) return res.json(common);
    }
    const { data, path, error } = readFileMeals();
    if (error) return res.status(500).json({ error: "Impossibile leggere file di fallback", detail: error });
    res.setHeader("X-Meals-Source", `file:${path}`);
    res.json(data);
  } catch (err) {
    console.error("Errore common-meals:", err);
    res.status(500).json({ error: "Errore nella lettura dei piatti comuni" });
  }
});

// LISTA con filtri; usa Mongo se pronto e con risultati, altrimenti file
router.get("/", async (req, res) => {
  const { restaurantId, tipologia, search } = req.query;
  const q = {};
  if (restaurantId) q.restaurantId = restaurantId;
  if (tipologia) q.tipologia = tipologia;
  if (search && String(search).trim()) {
    const s = String(search).trim();
    q.$or = [
      { nome: { $regex: s, $options: "i" } },
      { ingredienti: { $elemMatch: { $regex: s, $options: "i" } } },
    ];
  }

  // 1) prova Mongo
  if (mongoReady()) {
    try {
      const meals = await Meal.find(q).lean();
      if (meals.length) return res.json(meals);
    } catch (e) {
      console.warn("Mongo query error /meals:", e.message);
    }
  } else {
    console.warn("Mongo non connesso: fallback file per /meals");
  }

  // 2) fallback file
  const { data, path, error } = readFileMeals();
  if (error) {
    return res.status(500).json({ error: "Impossibile leggere i piatti di fallback", detail: error, file: path });
  }
  res.setHeader("X-Meals-Source", `file:${path}`);
  return res.json(data); // meglio 200 [] che 500
});

// GET per id (prova Mongo, poi file)
router.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  try {
    if (mongoReady()) {
      const n = Number.parseInt(id, 10);
      const meal = Number.isNaN(n) ? null : await Meal.findOne({ idmeals: n }).lean();
      if (meal) return res.json(meal);
    }
    const { data } = readFileMeals();
    let found = data.find(x =>
      String(x.idmeals) === id || String(x.id) === id || String(x.idMeal) === id
    );
    if (!found) return res.status(404).json({ error: "Piatto non trovato" });
    res.json(found);
  } catch (err) {
    console.error("Errore GET /meals/:id:", err);
    res.status(500).json({ error: "Errore nel recupero del piatto" });
  }
});

// CREATE (solo Mongo; se Mongo non è connesso -> 503)
router.post("/", async (req, res) => {
  if (!mongoReady()) return res.status(503).json({ error: "DB non disponibile" });
  try {
    if (!req.body.restaurantId) return res.status(400).json({ error: "restaurantId mancante" });
    if (!req.body.nome) return res.status(400).json({ error: "nome obbligatorio" });

    const payload = sanitizePayload(req.body, { isUpdate: false });
    if (payload.prezzo === undefined) return res.status(400).json({ error: "prezzo obbligatorio (numerico)" });

    payload.idmeals = await nextMealId();
    const created = await Meal.create(payload);
    res.status(201).json(created);
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.idmeals) {
      return res.status(409).json({ error: "idmeals duplicato, riprova" });
    }
    console.error("Errore POST /meals:", err);
    res.status(500).json({ error: "Errore nella creazione del piatto", detail: err.message });
  }
});

// UPDATE (solo Mongo)
router.put("/:id", async (req, res) => {
  if (!mongoReady()) return res.status(503).json({ error: "DB non disponibile" });
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "id non valido" });

    const updates = sanitizePayload(req.body, { isUpdate: true });
    const updated = await Meal.findOneAndUpdate(
      { idmeals: id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: "Piatto non trovato" });
    res.json(updated);
  } catch (err) {
    console.error("Errore PUT /meals/:id:", err);
    res.status(500).json({ error: "Errore nella modifica del piatto", detail: err.message });
  }
});

// DELETE (solo Mongo) compat: /meals/:restaurantId/:idmeals
router.delete("/:restaurantId/:idmeals", async (req, res) => {
  if (!mongoReady()) return res.status(503).json({ error: "DB non disponibile" });
  try {
    const id = Number.parseInt(req.params.idmeals, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "id non valido" });

    const { restaurantId } = req.params;
    const deleted = await Meal.findOneAndDelete({ restaurantId, idmeals: id });
    if (!deleted) return res.status(404).json({ error: "Piatto non trovato" });

    res.json({ success: true, removed: deleted });
  } catch (err) {
    console.error("Errore DELETE /meals/:restaurantId/:idmeals:", err);
    res.status(500).json({ error: "Errore nell'eliminazione del piatto", detail: err.message });
  }
});

// DELETE semplice: /meals/:id
router.delete("/:id", async (req, res) => {
  if (!mongoReady()) return res.status(503).json({ error: "DB non disponibile" });
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "id non valido" });

    const del = await Meal.findOneAndDelete({ idmeals: id });
    if (!del) return res.status(404).json({ error: "Piatto non trovato" });

    res.sendStatus(204);
  } catch (err) {
    console.error("Errore DELETE /meals/:id:", err);
    res.status(500).json({ error: "Errore nell'eliminazione del piatto", detail: err.message });
  }
});

module.exports = router;

