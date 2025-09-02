// meals.js — versione MongoDB (Mongoose)
const express = require("express");
const router = express.Router();
const Meal = require("./models/meal");

// 🧩 Utility: ricostruisce ingredienti da strIngredient1..20 → ingredienti[]
function buildIngredientiFromStr(obj) {
  if (Array.isArray(obj.ingredienti) && obj.ingredienti.length) return obj.ingredienti;
  const arr = [];
  for (let i = 1; i <= 20; i++) {
    const k = `strIngredient${i}`;
    if (obj[k]) {
      arr.push(String(obj[k]).trim());
      delete obj[k]; // pulizia
    }
  }
  return arr;
}

// 🧮 Utility: genera idmeals incrementale
async function nextMealId() {
  const last = await Meal.findOne().sort({ idmeals: -1 }).select("idmeals").lean();
  return (last?.idmeals || 0) + 1;
}

/** Piatti comuni */
router.get("/common-meals", async (_req, res) => {
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

/** Tutti i piatti (filtri: ?restaurantId= & ?tipologia= & ?search= ) */
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

/** Singolo piatto per idmeals */
router.get("/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).send("id non valido");
    const meal = await Meal.findOne({ idmeals: id }).lean();
    if (!meal) return res.status(404).send("Piatto non trovato");
    res.json(meal);
  } catch (err) {
    console.error("Errore GET /meals/:id:", err);
    res.status(500).send("Errore nel recupero del piatto");
  }
});

/** Aggiunta piatto */
router.post("/", async (req, res) => {
  try {
    const payload = { ...req.body };

    if (!payload.restaurantId) {
      return res.status(400).send("restaurantId mancante");
    }
    if (!payload.nome || typeof payload.prezzo !== "number") {
      return res.status(400).send("nome e prezzo sono obbligatori");
    }

    const ingredienti = buildIngredientiFromStr(payload);
    if (ingredienti?.length) payload.ingredienti = ingredienti;

    if (!payload.origine) payload.origine = "personalizzato";

    payload.idmeals = await nextMealId();

    const created = await Meal.create(payload);
    res.status(201).json(created);
  } catch (err) {
    // gestisci violazione di unique su idmeals
    if (err?.code === 11000 && err?.keyPattern?.idmeals) {
      return res.status(409).send("idmeals duplicato, riprova");
    }
    console.error("Errore POST /meals:", err);
    res.status(500).send("Errore nella creazione del piatto");
  }
});

/** Modifica piatto per idmeals */
router.put("/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).send("id non valido");

    const updates = { ...req.body };
    delete updates.idmeals; // non modificabile

    const ing = buildIngredientiFromStr(updates);
    if (ing?.length) updates.ingredienti = ing;

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

/** Elimina piatto (compat: /meals/:restaurantId/:idmeals) */
router.delete("/:restaurantId/:idmeals", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.idmeals, 10);
    if (Number.isNaN(id)) return res.status(400).send("id non valido");

    const { restaurantId } = req.params;

    const deleted = await Meal.findOneAndDelete({ restaurantId, idmeals: id });
    if (!deleted) return res.status(404).send("Piatto non trovato");

    res.json({ success: true, removed: deleted });
  } catch (err) {
    console.error("Errore DELETE /meals/:restaurantId/:idmeals:", err);
    res.status(500).send("Errore nell'eliminazione del piatto");
  }
});

module.exports = router;
