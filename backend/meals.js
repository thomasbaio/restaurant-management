const express = require("express");
const router = express.Router();
const Meal = require("./models/meal"); // backend/models/meal.js (minuscolo)
const fs = require("fs");
const path = require("path");

// --- Fallback file ---
const DATA_FILE = path.join(__dirname, "..", "meals1.json");
const readJson = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

// ---------- Helpers ----------
function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ingredienti da array o da strIngredient1..20
function extractIngredients(obj) {
  if (Array.isArray(obj.ingredienti) && obj.ingredienti.length) {
    return obj.ingredienti.filter(Boolean).map(String);
  }
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const k = `strIngredient${i}`;
    if (obj[k] && String(obj[k]).trim()) {
      out.push(String(obj[k]).trim());
      delete obj[k]; // pulizia
    }
  }
  return out;
}

async function nextMealId() {
  const last = await Meal.findOne().sort({ idmeals: -1 }).select("idmeals").lean();
  return (last?.idmeals || 0) + 1;
}

// normalizza i campi in input (POST/PUT)
function sanitizePayload(payload, { isUpdate = false } = {}) {
  const p = { ...payload };

  // alias immagine
  if (!p.immagine && p.foto) p.immagine = p.foto;

  // prezzo numerico (accetta stringhe da form)
  if (p.prezzo !== undefined) {
    const n = toNumber(p.prezzo);
    if (n === undefined) throw new Error("prezzo non numerico");
    p.prezzo = n;
  }

  // ingredienti
  const ing = extractIngredients(p);
  if (ing.length) p.ingredienti = ing;

  // origine default
  if (!isUpdate && !p.origine) p.origine = "personalizzato";

  // non permettere update di idmeals
  if (isUpdate) delete p.idmeals;

  return p;
}

// ---------- Rotte ----------

// Piatti comuni
router.get("/common-meals", async (_req, res) => {
  try {
    const common = await Meal.find({
      $or: [{ isCommon: true }, { origine: "comune" }],
    }).lean();

    // fallback se DB vuoto
    if (!common.length) {
      try {
        const fileMeals = readJson();
        return res.json(fileMeals);
      } catch (e) {
        return res.status(500).json({ error: "Impossibile leggere i piatti comuni di fallback", detail: e.message });
      }
    }

    res.json(common);
  } catch (err) {
    console.error("Errore nel leggere i piatti comuni:", err);
    // ultimo tentativo: file
    try {
      const fileMeals = readJson();
      return res.json(fileMeals);
    } catch (e2) {
      res.status(500).json({ error: "Errore nella lettura dei piatti comuni", detail: e2.message });
    }
  }
});

// Lista piatti (filtri: ?restaurantId=&tipologia=&search=)
router.get("/", async (req, res) => {
  try {
    const { restaurantId, tipologia, search } = req.query;
    const q = {};
    if (restaurantId) q.restaurantId = restaurantId;
    if (tipologia) q.tipologia = tipologia;

    // search su nome o ingredienti
    if (search && String(search).trim()) {
      const s = String(search).trim();
      q.$or = [
        { nome: { $regex: s, $options: "i" } },
        { ingredienti: { $elemMatch: { $regex: s, $options: "i" } } },
      ];
    }

    const meals = await Meal.find(q).lean();

    // fallback: DB vuoto / nessun match -> restituisco meals1.json
    if (!meals.length) {
      try {
        const fileMeals = readJson();
        return res.json(fileMeals);
      } catch (e) {
        console.error("Fallback readJson failed:", e.message, "FILE:", DATA_FILE);
        return res.status(500).json({ error: "Impossibile leggere i piatti di fallback", detail: e.message });
      }
    }

    res.json(meals);
  } catch (err) {
    console.error("Errore GET /meals:", err);
    // ultimo tentativo: prova comunque il file
    try {
      const fileMeals = readJson();
      return res.json(fileMeals);
    } catch (e2) {
      return res.status(500).json({ error: "Errore nel recupero dei piatti", detail: e2.message });
    }
  }
});

// Singolo piatto per idmeals (prova DB, poi file)
router.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  try {
    const n = Number.parseInt(id, 10);
    let meal = Number.isNaN(n) ? null : await Meal.findOne({ idmeals: n }).lean();
    if (meal) return res.json(meal);

    // fallback su file (supporta lista piatta o annidata)
    const data = readJson();
    let found = null;
    if (Array.isArray(data) && data.some(r => Array.isArray(r.menu))) {
      for (const r of data) {
        const m = (r.menu || []).find(x =>
          String(x.idmeals) === id || String(x.id) === id || String(x.idMeal) === id
        );
        if (m) { found = m; break; }
      }
    } else {
      found = (data || []).find(x =>
        String(x.idmeals) === id || String(x.id) === id || String(x.idMeal) === id
      );
    }
    if (!found) return res.status(404).json({ error: "Piatto non trovato" });
    res.json(found);
  } catch (err) {
    console.error("Errore GET /meals/:id:", err);
    res.status(500).json({ error: "Errore nel recupero del piatto", detail: err.message });
  }
});

// Crea piatto
router.post("/", async (req, res) => {
  try {
    if (!req.body.restaurantId) {
      return res.status(400).json({ error: "restaurantId mancante" });
    }
    if (!req.body.nome) {
      return res.status(400).json({ error: "nome obbligatorio" });
    }

    const payload = sanitizePayload(req.body, { isUpdate: false });

    if (payload.prezzo === undefined) {
      return res.status(400).json({ error: "prezzo obbligatorio (numerico)" });
    }

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

// Modifica piatto per idmeals
router.put("/:id", async (req, res) => {
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

// Elimina (compat: /meals/:restaurantId/:idmeals)
router.delete("/:restaurantId/:idmeals", async (req, res) => {
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

// Elimina semplice: /meals/:id (senza restaurantId)
router.delete("/:id", async (req, res) => {
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

// ====== DEV ONLY: seed DB da file (puoi rimuovere in produzione) ======
router.post("/seed-from-file", async (_req, res) => {
  try {
    const rows = readJson(); // lista piatta TheMealDB
    if (!Array.isArray(rows)) return res.status(400).json({ error: "Formato file non valido" });

    const docs = rows.map((r, idx) => ({
      idmeals: idx + 1,
      restaurantId: "r_o", // cambia se vuoi
      nome: r.strMeal,
      prezzo: 8 + (idx % 5),
      tipologia: r.strCategory || "",
      ingredienti: Array.from({ length: 20 })
        .map((_, i) => r[`strIngredient${i + 1}`])
        .filter(Boolean)
        .map(String),
      immagine: r.strMealThumb || "",
      origine: "comune",
      isCommon: true,
    }));

    await Meal.deleteMany({});
    await Meal.insertMany(docs);
    res.json({ inserted: docs.length });
  } catch (e) {
    console.error("Seed error:", e);
    res.status(500).json({ error: "Seed fallito", detail: e.message });
  }
});

module.exports = router;
