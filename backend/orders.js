// orders.js — versione Mongoose robusta con validazione
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

// ========== Helpers ==========
async function nextOrderId() {
  // id numerico incrementale, compatibile con vecchio JSON
  const last = await Order.findOne().sort({ id: -1 }).select("id").lean();
  return (last?.id || 0) + 1;
}

// Normalizza il body in ingresso
function normalizeBody(b) {
  const body = { ...(b || {}) };

  // username
  if (typeof body.username === "string") body.username = body.username.trim();

  // meals: forza a array di numeri
  if (!Array.isArray(body.meals)) body.meals = [];
  body.meals = body.meals
    .map(x => (typeof x === "string" ? x.trim() : x))
    .map(Number)
    .filter(n => Number.isFinite(n));

  // total numero
  body.total = Number(body.total);
  if (!Number.isFinite(body.total)) body.total = NaN;

  // payment / status default
  if (!body.payment) body.payment = "carta_credito";
  if (!body.status) body.status = "ordinato";

  // campi opzionali coerenti
  if (typeof body.note === "string") body.note = body.note.trim();
  if (typeof body.address === "string") body.address = body.address.trim();
  if (typeof body.restaurantId === "string") body.restaurantId = body.restaurantId.trim();

  return body;
}

// Valida il body normalizzato
function validateBody(body) {
  const errors = [];
  if (!body || typeof body !== "object") errors.push("Body mancante o non valido");
  if (!body.username) errors.push("username mancante");
  if (!Array.isArray(body.meals) || body.meals.length === 0) {
    errors.push("meals deve essere un array non vuoto di id numerici");
  }
  if (!Number.isFinite(body.total)) errors.push("total mancante o non numerico");
  if (!VALID_STATES.includes(body.status)) errors.push(`status non valido (${body.status})`);
  return errors;
}

// ========== ROUTES ==========

// ✅ Crea nuovo ordine
router.post("/", async (req, res) => {
  try {
    const data = normalizeBody(req.body);
    const errors = validateBody(data);
    if (errors.length) {
      return res.status(400).json({ error: "Payload non valido", details: errors });
    }

    const id = await nextOrderId();

    const created = await Order.create({
      id,
      username: data.username,
      meals: data.meals,
      total: data.total,
      payment: data.payment,
      status: data.status,
      note: data.note,
      address: data.address,
      restaurantId: data.restaurantId,
      timestamp: new Date().toISOString(),
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error("Errore POST /orders:", err);
    return res
      .status(500)
      .json({ error: "Errore creazione ordine", detail: String(err?.message || err) });
  }
});

// ✅ Lista ordini (filtrabile)
router.get("/", async (req, res) => {
  try {
    const { username, restaurantId, status } = req.query;
    const q = {};
    if (username) q.username = username;
    if (restaurantId) q.restaurantId = restaurantId;
    if (status) q.status = status;

    const orders = await Order.find(q).sort({ id: -1 }).lean();
    return res.json(orders);
  } catch (err) {
    console.error("Errore GET /orders:", err);
    return res.status(500).json({ error: "Errore recupero ordini" });
  }
});

// ✅ Aggiorna stato ordine
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const newStatus = String(req.body?.status || "");

    if (!VALID_STATES.includes(newStatus)) {
      return res.status(400).json({ error: "Stato non valido" });
    }

    const order = await Order.findOne({ id });
    if (!order) return res.status(404).json({ error: "Ordine non trovato" });

    // Enforce transizione (puoi rimuovere se vuoi libertà totale)
    const allowedNext = NEXT_ALLOWED[order.status] || [];
    if (order.status !== newStatus && !allowedNext.includes(newStatus)) {
      return res.status(400).json({
        error: `Transizione non valida da "${order.status}" a "${newStatus}"`,
        allowedNext,
      });
    }

    order.status = newStatus;
    await order.save();
    return res.json(order);
  } catch (err) {
    console.error("Errore PUT /orders/:id:", err);
    return res.status(500).json({ error: "Errore aggiornamento ordine" });
  }
});

module.exports = router;
