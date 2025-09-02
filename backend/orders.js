// orders.js — versione MongoDB (Mongoose)
const express = require("express");
const router = express.Router();
const Order = require("./models/order"); 

// Stati consentiti e transizioni base
const VALID_STATES = ["ordinato", "preparazione", "consegna", "consegnato"];
const NEXT_ALLOWED = {
  ordinato: ["preparazione"],
  preparazione: ["consegna"],
  consegna: ["consegnato"],
  consegnato: [] // finale
};

// 🧮 id incrementale compatibile con vecchio JSON (campo numerico 'id')
async function nextOrderId() {
  const last = await Order.findOne().sort({ id: -1 }).select("id").lean();
  return (last?.id || 0) + 1;
}

// ✅ Aggiungi un nuovo ordine (POST /orders)
router.post("/", async (req, res) => {
  try {
    const payload = { ...req.body };

    // id incrementale + campi di default
    payload.id = await nextOrderId();
    payload.timestamp = new Date().toISOString();
    payload.status = payload.status || "ordinato";

    if (!VALID_STATES.includes(payload.status)) {
      return res.status(400).json({ error: "Stato non valido" });
    }

    const created = await Order.create(payload);
    res.status(201).json(created);
  } catch (err) {
    console.error("Errore POST /orders:", err);
    res.status(500).json({ error: "Errore creazione ordine" });
  }
});

// ✅ Ottieni tutti gli ordini o filtrati (GET /orders?username=&restaurantId=)
router.get("/", async (req, res) => {
  try {
    const { username, restaurantId, status } = req.query;
    const q = {};
    if (username) q.username = username;
    if (restaurantId) q.restaurantId = restaurantId; // utile per ristoratore
    if (status) q.status = status;

    const orders = await Order.find(q).sort({ id: -1 }).lean();
    res.json(orders);
  } catch (err) {
    console.error("Errore GET /orders:", err);
    res.status(500).json({ error: "Errore recupero ordini" });
  }
});

// ✅ Aggiorna lo stato di un ordine (PUT /orders/:id)
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: "Stato mancante" });
    if (!VALID_STATES.includes(status)) {
      return res.status(400).json({ error: "Stato non valido" });
    }

    const order = await Order.findOne({ id });
    if (!order) return res.status(404).json({ error: "Ordine non trovato" });

    // Regola transizione (opzionale: puoi rimuoverla se vuoi libertà totale)
    const allowedNext = NEXT_ALLOWED[order.status] || [];
    if (!allowedNext.includes(status) && order.status !== status) {
      return res.status(400).json({
        error: `Transizione non valida da "${order.status}" a "${status}"`,
        allowedNext
      });
    }

    order.status = status;
    await order.save();
    res.json(order);
  } catch (err) {
    console.error("Errore PUT /orders/:id:", err);
    res.status(500).json({ error: "Errore aggiornamento ordine" });
  }
});

module.exports = router;
