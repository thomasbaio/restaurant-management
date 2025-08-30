const express = require("express");
const fs = require("fs");
const router = express.Router();

const DATA_FILE = "./restaurants.json";

// Lettura dati
function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

// Scrittura dati
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET ristorante per ID
router.get("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const restaurant = data.find(r => r.restaurantId === id);
  if (!restaurant) return res.status(404).send("Ristorante non trovato");
  res.json(restaurant);
});

// POST nuovo ristorante
router.post("/", (req, res) => {
  const data = readData();
  const newRistorante = req.body;
  newRistorante.restaurantId = data.length > 0 ? Math.max(...data.map(r => r.restaurantId)) + 1 : 1;
  data.push(newRistorante);
  writeData(data);
  res.status(201).json(newRistorante);
});

// PUT modifica ristorante
router.put("/:id", (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const index = data.findIndex(r => r.restaurantId === id);
  if (index === -1) return res.status(404).send("Ristorante non trovato");
  data[index] = { ...data[index], ...req.body };
  writeData(data);
  res.json(data[index]);
});

module.exports = router;
