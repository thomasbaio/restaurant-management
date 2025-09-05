// orders.js — Mongoose + inferenza userId/restaurantId
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const Order = require("./models/order");

// === Costanti file locali (fallback) ===
const USERS_FILE = path.join(__dirname, "users.json");
const MEALS_FILE = path.join(__dirname, "meals1.json");

// === Stati e transizioni ===
const VALID_STATES = ["ordinato", "preparazione", "consegna", "consegnato"];
const NEXT_ALLOWED = {
  ordinato: ["preparazione"],
  preparazione: ["consegna"],
  consegna: ["consegnato"],
  consegnato: []
};

// ---------- Helpers ----------
async function nextOrderId() {
  const last = await Order.findOne().sort({ id: -1 }).select("id").lean();
  return (last?.id || 0) + 1;
}

function safeReadJSON(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function inferUserIdFromUsername(username) {
  const data = safeReadJSON(USERS_FILE);
  if (!data || !Array.isArray(data)) return String(username || "");
  const u = data.find(
    x => (x.username || "").toLowerCase() === String(username || "").toLowerCase()
  );
  // restituisci id se presente, altrimenti username come stringa
  return (u && (u._id || u.id)) ? String(u._id || u.id) : String(username || "");
}

function inferRestaurantIdFromMeals(mealIds) {
  const data = safeReadJSON(MEALS_FILE);
  if (!data || !Array.isArray(data)) return "";
  // cerca il ristorante che contiene almeno uno degli id in menu[].idmeals
  for (const r of data) {
    const ids = (r.menu || []).map(m => Number(m.idmeals)).filter(Number.isFinite);
    if (mealIds.some(id => ids.includes(id))) {
      return String(r.restaurantId || r.id || "");
    }
  }
  return "";
}

function normalizeBody(b) {
  const body = { ...(b || {}) };

  body.username = typeof body.username === "string" ? body.username.trim() : "";

  // meals -> array numeri
  body.meals = Array.isArray(body.meals) ? body.meals : [];
  body.meals = body.meals
    .map(x => (typeof x === "string" ? x.trim() : x))
    .map(Number)
    .filter(Number.isFinite);

  body.total = Number(body.total);
  if (!Number.isFinite(body.total)) body.total = NaN;

  body.payment = body.payment || "carta_credito";
  body.status = body.status || "ordinato";

  // opzionali
  if (typeof body.note === "string") body.note = body.note.trim();
  if (typeof body.address === "string") body.address = body.address.trim();
  if (typeof body.restaurantId === "string") body.restaurantId = body.restaurantId.trim();
  if (typeof body.userId === "string") body.userId = body.userId.trim();

  return body;
}

function validateBody(body) {
  const errors = [];
  if (!body.username) errors.push("username mancante");
  if (!Array.isArray(body.meals) || body.meals.length === 0)
    errors.push("meals deve essere un array non vuoto di id numerici");
  if (!Number.isFinite(body.total)) errors.push("total mancante o non numerico");
  if (!VALID_STATES.includes(body.status)) errors.push(`status non valido (${body.status})`);
  if (!body.userId) errors.push("userId mancante");
  if (!body.restaurantId) errors.push("restaurantId mancante");
  return errors;
}

// ---------- ROUTES ----------

// POST /orders — crea ordine
router.post("/", async (req, res) => {
  try {
    const data = normalizeBody(req.body);

    // Se non arrivano, prova ad inferirli
    if (!data.userId) {
      data.userId = inferUserIdFromUsername(data.username);
    }
    if (!data.restaurantId && Array.isArray(data.meals) && data.meals.length) {
      data.restaurantId = inferRestaurantIdFromMeals(data.meals);
    }

    const errors = validateBody(data);
    if (errors.length) {
      return res.status(400).json({ error: "Payload non valido", details: errors });
    }

    const id = await nextOrderId();

    const created = await Order.create({
      id,
      username: data.username,
      userId: data.userId,
      restaurantId: data.restaurantId,
      meals: data.meals,
      total: data.total,
      payment: data.payment,
      status: data.status,
      note: data.note,
      address: data.address,
      timestamp: new Date().toISOString()
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error("Errore POST /orders:", err);
    return res
      .status(500)
      .json({ error: "Errore creazione ordine", detail: String(err?.message || err) });
  }
});

// GET /orders — elenco (filtri opzionali)
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

// PUT /orders/:id — aggiorna stato
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const newStatus = String(req.body?.status || "");

    if (!VALID_STATES.includes(newStatus)) {
      return res.status(400).json({ error: "Stato non valido" });
    }

    const order = await Order.findOne({ id });
    if (!order) return res.status(404).json({ error: "Ordine non trovato" });

    const allowedNext = NEXT_ALLOWED[order.status] || [];
    if (order.status !== newStatus && !allowedNext.includes(newStatus)) {
      return res.status(400).json({
        error: `Transizione non valida da "${order.status}" a "${newStatus}"`,
        allowedNext
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
