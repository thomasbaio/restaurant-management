// meals.js — versione MongoDB (Mongoose)
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

//  Assumiamo esista models/Meal.js
// Schema atteso (esempio):
// {
//   idmeals: Number,       // ID numerico incrementale per compatibilità frontend
//   nome: String,
//   prezzo: Number,
//   tipologia: String,
//   ingredienti: [String], // NB: usiamo 'ingredienti' in italiano
//   foto: String,
//   restaurantId: String,  // es. "r_o" o ID del ristoratore
//   origine: String,       // es. "comune" | "personalizzato"
//   isCommon: Boolean      // opzionale: alternativa a 'origine'
// }
const Meal = require("./models/Meal");

// 🧩 Utility: ricostruisce ingredienti da strIngredient1..20 → ingredienti[]
function buildIngredientiFromStr(obj) {
  if (Array.isArray(obj.ingredienti) && obj.ingredienti.length) return obj.ingredienti;

  const arr = [];
  for (let i = 1; i <= 20; i++) {
    const k = `strIngredient${i}`;
    if (obj[k]) {
      arr.push(String(obj[k]).trim());
      delete obj[k];
    }
  }
  return arr.length ? arr : [];
}

// 🧮 Utility: genera idmeals incrementale (compat con vecchio frontend)
async function nextMealId() {
  const last = await Meal.findOne().sort({ idmeals: -1 }).select("idmeals").lean();
  return (last?.idmeals || 0) + 1;
}

/**
 * ✅ Piatti comuni
 * Restituisce i piatti marcati come comuni.
 * Criterio: isCommon === true OR origine === "comune"
 */
router.get("/common-meals", async (req, res) => {
  try {
    const common = await Meal.find({
      $or: [{ isCommon: true }, { origine: "comune" }],
    }).lean();
    res.json(common);
  } catch (err) {
    console.error("Errore nel leggere i piatti comuni:", err);
    res.status(500).send("Errore nella lettura dei piatti comuni");
  }
});

/**
 * ✅ Tutti i piatti (eventualmente filtrabili)
 * Query supportate:
 *  - ?restaurantId=...
 *  - ?tipologia=...
 *  - ?search=... (match parziale su nome)
 */
router.get("/", async (req, res) => {
  try {
    const { restaurantId, tipologia, search } = req.query;
    const q = {};
    if (restaurantId) q.restaurantId = restaurantId;
    if (tipologia) q.tipologia = tipologia;
    if (search) q.nome = { $regex: search, $options: "i" };

    const meals = await Meal.find(q).lean();
    res.json(meals);
  } catch (err) {
    console.error("Errore GET /meals:", err);
    res.status(500).send("Errore nel recupero dei piatti");
  }
});

/**
 * ✅ Singolo piatto per idmeals
 */
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const meal = await Meal.findOne({ idmeals: id }).lean();
    if (!meal) return res.status(404).send("Piatto non trovato");
    res.json(meal);
  } catch (err) {
    console.error("Errore GET /meals/:id:", err);
    res.status(500).send("Errore nel recupero del piatto");
  }
});

/**
 * ✅ Aggiunta piatto
 * Body richiesto: { restaurantId, nome, prezzo, tipologia, ingredienti? | strIngredient1..20, foto?, origine? }
 */
router.post("/", async (req, res) => {
  try {
    const payload = { ...req.body };

    if (!payload.restaurantId) {
      return res.status(400).send("restaurantId mancante");
    }

    // Ricostruzione ingredienti se arrivano come strIngredientX
    const ingredienti = buildIngredientiFromStr(payload);
    if (ingredienti.length) payload.ingredienti = ingredienti;

    // Imposta origine di default se non fornita
    if (!payload.origine) payload.origine = "personalizzato";

    // Genera idmeals incrementale
    payload.idmeals = await nextMealId();

    const created = await Meal.create(payload);
    res.status(201).json(created);
  } catch (err) {
    console.error("Errore POST /meals:", err);
    res.status(500).send("Errore nella creazione del piatto");
  }
});

/**
 * ✅ Modifica piatto esistente (per idmeals)
 */
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = { ...req.body };

    // Se arrivano strIngredientX, ricostruisci
    const ing = buildIngredientiFromStr(updates);
    if (ing.length) updates.ingredienti = ing;

    // Non permettiamo di cambiare l'idmeals
    delete updates.idmeals;

    const updated = await Meal.findOneAndUpdate(
      { idmeals: id },
      { $set: updates },
      { new: true }
    );

    if (!updated) return res.status(404).send("Piatto non trovato");
    res.json(updated);
  } catch (err) {
    console.error("Errore PUT /meals/:id:", err);
    res.status(500).send("Errore nella modifica del piatto");
  }
});

/**
 * ✅ Elimina piatto (compat con vecchio frontend)
 * Route: /meals/:restaurantId/:idmeals
 * Nota: in Mongo filtriamo per entrambi per sicurezza.
 */
router.delete("/:restaurantId/:idmeals", async (req, res) => {
  try {
    const { restaurantId, idmeals } = req.params;
    const id = parseInt(idmeals);

    const deleted = await Meal.findOneAndDelete({ restaurantId, idmeals: id });
    if (!deleted) return res.status(404).send("Piatto non trovato");

    res.json({ success: true, removed: deleted });
  } catch (err) {
    console.error("Errore DELETE /meals/:restaurantId/:idmeals:", err);
    res.status(500).send("Errore nell'eliminazione del piatto");
  }
});

module.exports = router;