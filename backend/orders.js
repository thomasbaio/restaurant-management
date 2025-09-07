const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const Order = require("./models/order");

// === file locali (fallback)
const USERS_FILE = path.join(__dirname, "users.json");
const MEALS_FILE = path.join(__dirname, "meals1.json");

// === stati e transizioni (+ 'ritirato')
const VALID_STATES = ["ordinato", "preparazione", "consegna", "consegnato", "ritirato", "annullato"];
const FINAL_STATES = new Set(["consegnato", "annullato", "ritirato"]);

const NEXT_ALLOWED = {
  ordinato:     ["preparazione", "annullato", "ritirato"], // pickup diretto
  preparazione: ["consegna", "ritirato", "annullato"],
  consegna:     ["consegnato"],
  consegnato:   [],
  ritirato:     [],
  annullato:    []
};

// ---------- helpers ----------
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
  const u = data.find(x => (x.username || "").toLowerCase() === String(username || "").toLowerCase());
  return (u && (u._id || u.id)) ? String(u._id || u.id) : String(username || "");
}

function flattenFileMeals() {
  const data = safeReadJSON(MEALS_FILE);
  if (!data || !Array.isArray(data)) return [];
  return data.flatMap(r =>
    (r.menu || []).map(p => ({
      restaurantId: String(r.restaurantId || r.id || ""),
      id: String(p.idmeals ?? p.id ?? p._id ?? ""),
      nome: p.nome ?? p.strMeal ?? p.name ?? "Senza nome",
      prezzo: Number(p.prezzo ?? p.price ?? 0) || 0
    }))
  );
}

function inferRestaurantIdFromMeals(mealIds) {
  const meals = flattenFileMeals();
  const set = new Set(mealIds.map(String));
  const hit = meals.find(m => set.has(m.id));
  return hit ? hit.restaurantId : "";
}

const toStr = v => (v == null ? null : String(v).trim());

function extractItemsFromAny(body) {
  const buckets = []
    .concat(Array.isArray(body.items) ? body.items : [])
    .concat(Array.isArray(body.cart) ? body.cart : [])
    .concat(Array.isArray(body.cartItems) ? body.cartItems : [])
    .concat(Array.isArray(body.meals) ? body.meals : []);

  return buckets
    .map(x => {
      if (typeof x === "string" || typeof x === "number") {
        return { mealId: toStr(x), qty: 1 };
      }
      if (x && typeof x === "object") {
        const mealId = toStr(x.mealId ?? x.idmeals ?? x.idMeal ?? x.id ?? x._id);
        const qty = Number(x.qty ?? x.quantity ?? 1) || 1;
        const name = x.nome ?? x.strMeal ?? x.name ?? x.title;
        const priceRaw = x.prezzo ?? x.price;
        const price = priceRaw != null ? Number(priceRaw) : undefined;
        return mealId ? { mealId, qty, name, price } : null;
      }
      return null;
    })
    .filter(Boolean);
}

function collapseItems(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.mealId;
    if (!map.has(key)) map.set(key, { mealId: key, qty: 0, name: undefined, price: undefined });
    const cur = map.get(key);
    cur.qty += it.qty || 1;
    if (!cur.name && it.name) cur.name = it.name;
    if (cur.price == null && it.price != null && !Number.isNaN(Number(it.price))) {
      cur.price = Number(it.price);
    }
  }
  return [...map.values()];
}

function enrichItemsFromFile(items) {
  const catalog = flattenFileMeals();
  const byId = new Map(catalog.map(m => [m.id, m]));
  return items.map(it => {
    const m = byId.get(it.mealId);
    return {
      ...it,
      name: it.name ?? m?.nome ?? "Senza nome",
      price: it.price != null ? Number(it.price) : (m ? Number(m.prezzo) : 0)
    };
  });
}

function computeTotal(items) {
  let tot = 0;
  for (const it of items) {
    const q = Number(it.qty || 1);
    const pr = Number(it.price || 0);
    tot += q * (Number.isFinite(pr) ? pr : 0);
  }
  return Number(tot.toFixed(2));
}

function normalizeDelivery(obj) {
  let delivery = obj.delivery;
  let fulfillment = obj.fulfillment;

  if (!delivery && fulfillment) {
    delivery = fulfillment === "ritiro" ? "asporto" : (fulfillment === "consegna" ? "domicilio" : undefined);
  }
  if (!fulfillment && delivery) {
    fulfillment = delivery === "asporto" ? "ritiro" : (delivery === "domicilio" ? "consegna" : undefined);
  }
  return { delivery, fulfillment };
}

function normalizeBody(b) {
  const body = { ...(b || {}) };

  body.username = typeof body.username === "string" ? body.username.trim() : "";
  body.payment = body.payment || "carta";
  body.status = body.status && VALID_STATES.includes(body.status) ? body.status : "ordinato";

  if (typeof body.address === "string") body.address = body.address.trim();
  if (typeof body.userId === "string") body.userId = body.userId.trim();
  if (typeof body.restaurantId === "string") body.restaurantId = body.restaurantId.trim();

  const { delivery, fulfillment } = normalizeDelivery(body);
  body.delivery = delivery;
  body.fulfillment = fulfillment;

  return body;
}

function normalizePaymentMethod(m) {
  const s = String(m || "carta").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (["carta", "card", "credit_card", "carta_credito", "carta_di_credito"].includes(s)) return "carta";
  if (["contanti", "cash"].includes(s)) return "contanti";
  if (["online", "paypal", "stripe"].includes(s)) return "online";
  return "carta";
}

// cerca ordine sia per id incrementale sia per _id Mongo
async function findOrderByAnyId(idParam) {
  const asNumber = Number(idParam);
  if (Number.isFinite(asNumber)) {
    const byNumeric = await Order.findOne({ id: asNumber });
    if (byNumeric) return byNumeric;
  }
  try {
    const byMongo = await Order.findById(idParam);
    if (byMongo) return byMongo;
  } catch (_) {}
  return null;
}

function validateForCreate(payload) {
  const errors = [];
  if (!payload.username) errors.push("username mancante");
  if (!payload.items || !payload.items.length) errors.push("nessun piatto nell'ordine");
  if (!payload.userId) errors.push("userId mancante");
  if (!payload.restaurantId) errors.push("restaurantId mancante");
  return errors;
}

// ---------- routers ----------

// post /orders — crea ordine completo con snapshot items
router.post("/", async (req, res) => {
  try {
    const raw = normalizeBody(req.body);

    let items = extractItemsFromAny(raw);
    items = collapseItems(items);
    items = enrichItemsFromFile(items);

    const meals = items.map(it => String(it.mealId));
    if (!raw.userId) raw.userId = inferUserIdFromUsername(raw.username);
    if (!raw.restaurantId) raw.restaurantId = inferRestaurantIdFromMeals(meals);

    const rawPayment = raw.payment;
    const methodIn = typeof rawPayment === "object" ? rawPayment.method : rawPayment;
    const method = normalizePaymentMethod(methodIn);
    const payment = {
      method,
      paid: typeof rawPayment === "object" ? Boolean(rawPayment.paid) : false,
      transactionId: typeof rawPayment === "object" ? rawPayment.transactionId : undefined
    };

    const payload = {
      id: await nextOrderId(),
      username: raw.username,
      userId: raw.userId,
      restaurantId: raw.restaurantId,
      items,
      meals,
      total: computeTotal(items),
      status: raw.status,               // campo nuovo
      state: raw.status,                // compat con vecchio codice
      payment,
      delivery: raw.delivery || "asporto",
      fulfillment: raw.fulfillment || (raw.delivery === "domicilio" ? "consegna" : "ritiro"),
      address: raw.address,
      note: raw.note
    };

    const errors = validateForCreate(payload);
    if (errors.length) {
      return res.status(400).json({ error: "Payload not valid", details: errors });
    }

    const created = await Order.create(payload);
    return res.status(201).json(created);
  } catch (err) {
    console.error("Errore POST /orders:", err);
    return res.status(500).json({ error: "Error during create of the order ", detail: String(err?.message || err) });
  }
});

// get /orders — elenco (filtri opzionali)
router.get("/", async (req, res) => {
  try {
    const { username, restaurantId, status, state } = req.query;
    const q = {};
    if (username) q.username = username;
    if (restaurantId) q.restaurantId = restaurantId;
    // consenti filtro sia con status che state
    if (status) q.$or = [{ status }, { state: status }];
    else if (state) q.$or = [{ status: state }, { state }];

    const orders = await Order.find(q).sort({ createdAt: -1, id: -1 }).lean();
    return res.json(orders);
  } catch (err) {
    console.error("Error GET /orders:", err);
    return res.status(500).json({ error: "Error order recovery" });
  }
});

// --- funzione comune per cambio stato ---
async function updateOrderStateGeneric(idParam, incomingBody, res) {
  const desired = String(incomingBody?.status ?? incomingBody?.state ?? incomingBody?.newState ?? "").trim();
  const clienteConfermaRitiro = incomingBody?.clienteConfermaRitiro;

  if (!VALID_STATES.includes(desired)) {
    return res.status(400).json({ error: `Status not valid: ${desired}` });
  }

  const order = await findOrderByAnyId(idParam);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const current = order.status || order.state || "ordinato";
  const allowedNext = NEXT_ALLOWED[current] || [];
  if (current !== desired && !allowedNext.includes(desired)) {
    return res.status(422).json({
      error: `Transizione non valida da "${current}" a "${desired}"`,
      allowedNext
    });
  }

  order.status = desired;
  order.state  = desired;

  if (typeof clienteConfermaRitiro !== "undefined") {
    order.clienteConfermaRitiro = Boolean(clienteConfermaRitiro);
  }

  const s = desired.toLowerCase();
  if (s === "consegnato" && !order.deliveredAt) order.deliveredAt = new Date();
  if (s === "ritirato"   && !order.ritiratoAt)  order.ritiratoAt  = new Date();
  if (s === "ritirato") order.ritiroConfermato = true;
  if (FINAL_STATES.has(s)) order.closedAt = order.closedAt || new Date();

  await order.save();
  return res.json(order);
}

// PUT /orders/:id — aggiorna stato (compat con vecchio body)
router.put("/:id", async (req, res) => {
  try {
    await updateOrderStateGeneric(req.params.id, req.body, res);
  } catch (err) {
    console.error("Errore PUT /orders/:id:", err);
    return res.status(500).json({ error: "Errore aggiornamento ordine", detail: String(err?.message || err) });
  }
});

// PUT /orders/:id/state — alias (accetta { newState })
router.put("/:id/state", async (req, res) => {
  try {
    await updateOrderStateGeneric(req.params.id, req.body, res);
  } catch (err) {
    console.error("Errore PUT /orders/:id/state:", err);
    return res.status(500).json({ error: "Errore aggiornamento ordine", detail: String(err?.message || err) });
  }
});

module.exports = router;

