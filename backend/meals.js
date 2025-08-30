const express = require("express");
const fs = require("fs");
const router = express.Router();

const DATA_FILE = "./meals1.json";       // dati per ristoranti
const COMMON_MEALS_FILE = "./meals1.json"; // lista piatti comuni

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function readCommonMeals() {
  return JSON.parse(fs.readFileSync(COMMON_MEALS_FILE));
}

// ✅ Piatti comuni (endpoint compatibile con frontend)
router.get("/common-meals", (req, res) => {
  try {
    const meals = readCommonMeals();
    res.json(meals);
  } catch (err) {
    console.error("Errore nel leggere i piatti comuni:", err);
    res.status(500).send("Errore nella lettura dei piatti comuni");
  }
});

// ✅ Tutti i piatti dei ristoranti
router.get("/", (req, res) => {
  const data = readData();
  res.json(data);
});

// ✅ Singolo piatto per idmeals
router.get("/:id", (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  for (const r of data) {
    const meal = r.menu?.find(m => m.idmeals === id);
    if (meal) return res.json(meal);
  }
  res.status(404).send("Piatto non trovato");
});

// ✅ Aggiunta piatto al menu del ristorante
router.post("/", (req, res) => {
  const data = readData();
  const newMeal = req.body;
  const { restaurantId } = newMeal;

  if (!restaurantId) return res.status(400).send("restaurantId mancante");

  // Debug: stampa solo se contiene ingredienti comuni
  if (newMeal.strIngredient1 || newMeal.strIngredient2) {
    console.log("🔍 Piatto ricevuto con strIngredientX:", JSON.stringify(newMeal, null, 2));
  }

  // Se mancano gli ingredients ma ci sono strIngredientX, li ricostruiamo
if (!Array.isArray(newMeal.ingredients) || newMeal.ingredients.length === 0) {
  const reconstructed = [];
  for (let i = 1; i <= 20; i++) {
    const key = `strIngredient${i}`;
    if (newMeal[key]) {
      reconstructed.push(newMeal[key]);
      delete newMeal[key];
    }
  }
  if (reconstructed.length > 0) {
    newMeal.ingredients = reconstructed;
  }
}


  const restaurant = data.find(r => r.restaurantId == restaurantId);
  if (!restaurant) return res.status(404).send("Ristorante non trovato");

  const allMeals = data.flatMap(r => r.menu || []);
  const maxId = Math.max(0, ...allMeals.map(m => m.idmeals || 0));
  newMeal.idmeals = maxId + 1;

  if (!restaurant.menu) restaurant.menu = [];

  if (!newMeal.origine) newMeal.origine = "personalizzato";

  restaurant.menu.push(newMeal);
  writeData(data);
  res.status(201).json(newMeal);
});

// ✅ Modifica piatto esistente
router.put("/:id", (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);

  for (const r of data) {
    const mealIndex = r.menu?.findIndex(m => m.idmeals === id);
    if (mealIndex >= 0) {
      const updated = {
        ...r.menu[mealIndex],
        ...req.body,
        idmeals: id
      };
      r.menu[mealIndex] = updated;
      writeData(data);
      return res.json(updated);
    }
  }

  res.status(404).send("Piatto non trovato");
});

// ✅ Elimina piatto dal menu del ristorante
router.delete("/:restaurantId/:idmeals", (req, res) => {
  const data = readData();
  const { restaurantId, idmeals } = req.params;
  const id = parseInt(idmeals);

  const restaurant = data.find(r => r.restaurantId == restaurantId);
  if (!restaurant || !restaurant.menu) {
    return res.status(404).send("Ristorante o menu non trovato");
  }

  const index = restaurant.menu.findIndex(m => m.idmeals === id);
  if (index === -1) return res.status(404).send("Piatto non trovato");

  const removed = restaurant.menu.splice(index, 1);
  writeData(data);
  res.json({ success: true, removed });
});

module.exports = router;
