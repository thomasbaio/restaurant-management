const express = require("express");
const router = express.Router();

const Meal = require("./models/meal");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
// Piatti comuni — UNIONE file + DB, con deduplica (DB ha priorità)
// Opzionale: ?source=file | db | all  (default: all)
router.get("/common-meals", async (req, res) => {
  try {
    const source = String(req.query.source || 'all').toLowerCase(); // 'all' | 'file' | 'db'

    // --- File (flatten) ---
    let fileMeals = [];
    if (source !== 'db') {
      const { data, path, error } = readFileMeals();
      if (error) {
        return res.status(500).json({ error: "Impossibile leggere file di fallback", detail: error });
      }
      fileMeals = flattenFileMeals(data).map(withIngredients);
      res.setHeader("X-Meals-File", path);
    }

    // --- DB ---
    let dbMeals = [];
    if (source !== 'file' && mongoReady()) {
      dbMeals = await Meal
        .find({ $or: [{ isCommon: true }, { origine: "comune" }] })
        .lean();
      dbMeals = dbMeals.map(withIngredients);
      res.setHeader("X-Meals-DB", String(dbMeals.length));
    }

    // --- Unione + dedup (preferisco DB > file) ---
    const keyOf = (m) => {
      const id = m.idmeals || m.idMeal || m.id;
      if (id != null) return String(id).toLowerCase();
      const name = (m.nome || m.name || m.strMeal || '').toLowerCase();
      const cat  = (m.tipologia || m.category || m.strCategory || '').toLowerCase();
      return `${name}|${cat}`;
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
    res.status(500).json({ error: "Errore nella lettura dei piatti comuni" });
  }
});


module.exports = router;