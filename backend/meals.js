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

function readFileMeals() {
  try {
    const filePath = path.join(__dirname, "meals1.json");
    if (!fs.existsSync(filePath)) {
      return { data: [], filePath, error: null };
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw || "[]");
    return { data, filePath, error: null };
  } catch (err) {
    return { data: [], filePath: "meals1.json", error: String(err?.message || err) };
  }
}

function flattenFileMeals(data) {
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const r of data) {
    const menu = Array.isArray(r?.menu) ? r.menu : [];
    for (const m of menu) {
      out.push({ ...m, restaurantId: r.restaurantId ?? r.id ?? r._id });
    }
  }
  return out;
}

function withIngredients(m) {
  if (Array.isArray(m.ingredienti)) return m;

  const clone = { ...m };

  if (Array.isArray(m.ingredients)) {
    clone.ingredienti = m.ingredients.filter(Boolean);
    delete clone.ingredients;
    return clone;
  }

  const list = [];
  for (let i = 1; i <= 20; i++) {
    const ing = m[`strIngredient${i}`];
    const meas = m[`strMeasure${i}`];
    if (ing && String(ing).trim()) {
      list.push(meas ? `${meas} ${ing}`.trim() : String(ing).trim());
    }
  }
  if (list.length) clone.ingredienti = list;
  return clone;
}

// --------------------- Rotte ----------------------

// GET /meals/common-meals
// Unisce piatti "comuni" da file + DB (dedup, priorità DB)
// Query opzionali: ?source=file|db|all  ?dedup=global|perRestaurant|off
router.get("/common-meals", async (req, res) => {
  try {
    const source = String(req.query.source || "all").toLowerCase(); // 'all' | 'file' | 'db'
    const dedupMode = String(req.query.dedup || "perRestaurant").toLowerCase(); // 'perRestaurant' | 'global' | 'off'

    // --- File ---
    let fileMeals = [];
    if (source !== "db") {
      const { data, filePath, error } = readFileMeals();
      if (error && source === "file") {
        return res.status(500).json({ error: "Impossibile leggere il file dei piatti comuni", detail: error });
      }
      fileMeals = flattenFileMeals(data).map(withIngredients);
      res.setHeader("X-Meals-File", filePath);
      res.setHeader("X-Meals-File-Count", String(fileMeals.length));
    }

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

    // --- Unione + dedup (priorità DB) ---
    const keyOf = (m) => {
      const id = m.idmeals ?? m.idMeal ?? m.id ?? m._id;
      if (id != null) return String(id).toLowerCase();

      const name = (m.nome || m.name || m.strMeal || "").toLowerCase().trim();
      const cat  = (m.tipologia || m.category || m.strCategory || "").toLowerCase().trim();
      const rid  = (m.restaurantId || "").toString().toLowerCase().trim();

      if (dedupMode === "off")     return `${Math.random()}|${name}|${cat}`;
      if (dedupMode === "global")  return `${name}|${cat}`;
      // default: per ristorante
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
    return res.status(500).json({ error: "Errore nella lettura dei piatti comuni", detail: String(err?.message || err) });
  }
});

module.exports = router;
