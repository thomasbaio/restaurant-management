const express = require('express'); 
const fs = require('fs');
const router = express.Router();
const ORDERS_FILE = './orders.json';

function readOrders() {
  if (!fs.existsSync(ORDERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ORDERS_FILE));
}

function writeOrders(data) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
}

// ✅ Aggiungi un nuovo ordine (POST /orders)
router.post('/', (req, res) => {
  const orders = readOrders();
  const newOrder = req.body;

  newOrder.id = orders.length ? orders[orders.length - 1].id + 1 : 1;
  newOrder.timestamp = new Date().toISOString();
  newOrder.status = newOrder.status || "ordinato"; // fallback

  orders.push(newOrder);
  writeOrders(orders);
  res.status(201).json(newOrder);
});

// ✅ Ottieni tutti gli ordini o solo quelli di un utente (GET /orders)
router.get('/', (req, res) => {
  const orders = readOrders();
  const username = req.query.username;

  if (username) {
    const userOrders = orders.filter(o => o.username === username);
    return res.json(userOrders);
  }

  res.json(orders);
});

// ✅ Aggiorna lo stato di un ordine (PUT /orders/:id)
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;

  if (!status) return res.status(400).send("Stato mancante");

  const orders = readOrders();
  const index = orders.findIndex(o => o.id === id);
  if (index === -1) return res.status(404).send("Ordine non trovato");

  orders[index].status = status;
  writeOrders(orders);

  res.json(orders[index]);
});

module.exports = router;
