const express = require("express");
const router = express.Router();
const Meal = require("./models/meal"); // file: backend/models/meal.js (minuscolo)

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
    res.json(common);
  } catch (err) {
    console.error("Errore nel leggere i piatti comuni:", err);
    res.status(500).json({ error: "Errore nella lettura dei piatti comuni" });
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
    res.json(meals);
  } catch (err) {
    console.error("Errore GET /meals:", err);
    res.status(500).json({ error: "Errore nel recupero dei piatti" });
  }
});

// Singolo piatto per idmeals
router.get("/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "id non valido" });

    const meal = await Meal.findOne({ idmeals: id }).lean();
    if (!meal) return res.status(404).json({ error: "Piatto non trovato" });

    res.json(meal);
  } catch (err) {
    console.error("Errore GET /meals/:id:", err);
    res.status(500).json({ error: "Errore nel recupero del piatto" });
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

module.exports = router;
