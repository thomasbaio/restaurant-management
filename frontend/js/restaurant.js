const express = require("express");
const fs = require("fs");
const router = express.Router();

const DATA_FILE = "./restaurants.json";

// 🧠 Lettura dati ristoranti
function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

// 💾 Scrittura dati ristoranti
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 📥 Crea nuovo ristorante
router.post("/", (req, res) => {
  const data = readData();
  const newRisto = req.body;

  const newId = data.length > 0 ? Math.max(...data.map(r => r.restaurantId)) + 1 : 1;
  newRisto.restaurantId = newId;

  data.push(newRisto);
  writeData(data);

  res.status(201).json(newRisto);
});

// 📤 Ottieni ristorante per ID
router.get("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();
  const found = data.find(r => r.restaurantId === id);

  if (!found) return res.status(404).send("Ristorante non trovato");
  res.json(found);
});

// ✏️ Modifica ristorante
router.put("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const data = readData();

  const index = data.findIndex(r => r.restaurantId === id);
  if (index === -1) return res.status(404).send("Ristorante non trovato");

  data[index] = { ...data[index], ...req.body, restaurantId: id };
  writeData(data);

  res.json(data[index]);
});

// ❌ Elimina ristorante (facoltativo)
router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  let data = readData();

  const index = data.findIndex(r => r.restaurantId === id);
  if (index === -1) return res.status(404).send("Ristorante non trovato");

  data.splice(index, 1);
  writeData(data);

  res.sendStatus(204);
});

module.exports = router;

