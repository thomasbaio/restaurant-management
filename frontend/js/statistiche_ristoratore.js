// ========================= BASE URL =========================
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = isLocal
  ? "http://localhost:3000"
  : (window.API_BASE ||
     (location.origin.includes("onrender.com")
        ? "https://restaurant-management-wzhj.onrender.com"
        : location.origin));

// ========================= HELPERS =========================
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    mode: "cors",
    ...options
  });
  const text = await res.text().catch(() => "");
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || text || `HTTP ${res.status}`;
    throw new Error(`${url} → ${msg}`);
  }
  return data;
}

// Prova un URL ma accetta solo risposta "array" (lista ordini)
async function probeOrders(url) {
  const data = await fetchJSON(url);
  if (Array.isArray(data)) return data;
  // alcuni backend incapsulano in {orders:[...]}
  if (data && Array.isArray(data.orders)) return data.orders;
  throw new Error(`${url} → formato non valido`);
}

// Prova in sequenza più URL e restituisce {url, data}
async function discoverOrders(restaurantId) {
  const qs = `restaurantId=${encodeURIComponent(restaurantId)}`;
  const candidates = [
    `${API_BASE}/orders?${qs}`,
    `${API_BASE}/api/orders?${qs}`,
    `${API_BASE}/v1/orders?${qs}`,
    `${API_BASE}/orders/restaurant/${encodeURIComponent(restaurantId)}`,
    `${API_BASE}/api/orders/restaurant/${encodeURIComponent(restaurantId)}`,
    `${API_BASE}/v1/orders/restaurant/${encodeURIComponent(restaurantId)}`,
    // fallback “tutto” (filtreremo lato client)
    `${API_BASE}/orders`,
    `${API_BASE}/api/orders`,
    `${API_BASE}/v1/orders`
  ];

  let lastErr = null;
  for (const u of candidates) {
    try {
      const data = await probeOrders(u);
      console.info("[STATISTICHE] endpoint ordini rilevato:", u);
      return { url: u, data };
    } catch (e) {
      console.warn("[STATISTICHE] fallito", u, e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error("Nessuna rotta /orders trovata");
}

// Meals
async function discoverMeals(restaurantId) {
  const candidates = [
    `${API_BASE}/meals`,
    `${API_BASE}/meals/common-meals`,
    `${API_BASE}/api/meals`,
    `${API_BASE}/v1/meals`
  ];
  let lastErr = null;
  for (const u of candidates) {
    try {
      const data = await fetchJSON(u);
      // normalizza in [{restaurantId, menu:[...]}]
      if (Array.isArray(data) && data[0]?.menu) return data;
      if (Array.isArray(data)) return [{ restaurantId, menu: data }]; // piatti comuni
      if (data?.restaurants) return data.restaurants;
      // se non riconosco, forzo errore per provare il prossimo
      throw new Error("formato meals non riconosciuto");
    } catch (e) {
      console.warn("[STATISTICHE] meals fallito", u, e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error("Nessuna rotta /meals trovata");
}

// utils
const S = (v) => (v == null ? undefined : String(v));
const money = (n) => `€${Number(n || 0).toFixed(2)}`;

function mealId(p) {
  return S(p?.idmeals ?? p?.idMeal ?? p?.id ?? p?._id);
}
function mealName(p) {
  return p?.nome ?? p?.strMeal ?? p?.name ?? p?.title ?? "Unnamed";
}
function mealPrice(p) {
  const n = Number(p?.prezzo ?? p?.price ?? p?.costo ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Normalizza righe ordine: [{mealId, qty, price}]
function normalizeOrderLines(order) {
  const out = [];

  const pushId = (id) => out.push({ mealId: S(id), qty: 1, price: undefined });
  (order.meals || []).forEach(pushId);
  (order.dishes || []).forEach(pushId);

  // items può essere array di ID o oggetti
  if (Array.isArray(order.items)) {
    for (const it of order.items) {
      if (typeof it === "string" || typeof it === "number") {
        pushId(it);
      } else if (it) {
        out.push({
          mealId: S(it.mealId ?? it.id ?? it._id ?? it.productId),
          qty: Number(it.qty ?? it.quantity ?? 1) || 1,
          price: Number(it.price ?? it.prezzo)
        });
      }
    }
  }

  // altre chiavi comuni
  for (const key of ["lines", "products", "cart"]) {
    const arr = order[key];
    if (Array.isArray(arr)) {
      for (const it of arr) {
        out.push({
          mealId: S(it?.mealId ?? it?.id ?? it?._id ?? it?.productId),
          qty: Number(it?.qty ?? it?.quantity ?? 1) || 1,
          price: Number(it?.price ?? it?.prezzo)
        });
      }
    }
  }

  return out.filter(x => x.mealId);
}

// ========================= MAIN =========================
window.addEventListener("load", async () => {
  // auth
  let user = null;
  try { user = JSON.parse(localStorage.getItem("loggedUser") || "null"); } catch {}
  if (!user || user.role !== "ristoratore") {
    alert("Access reserved for restaurateurs");
    location.href = "login.html";
    return;
  }
  const rid = user.restaurantId || user._id || "r_o";

  // DOM
  const totOrdini   = document.getElementById("tot-ordini");
  const totPiatti   = document.getElementById("tot-piatti");
  const totIncasso  = document.getElementById("tot-incasso");
  const topUl       = document.getElementById("piatti-popolari");
  const errorBox    = document.getElementById("stats-error");

  // placeholders
  if (totOrdini)  totOrdini.textContent  = "—";
  if (totPiatti)  totPiatti.textContent  = "—";
  if (totIncasso) totIncasso.textContent = "—";
  if (topUl) topUl.innerHTML = "<li class='muted'>Loading…</li>";
  if (errorBox) errorBox.textContent = "";

  try {
    // 1) trova endpoint ordini e carica dati
    const { url: ordersUrl, data: ordersRaw } = await discoverOrders(rid);

    // 2) carica menu e mappa id -> piatto
    const restaurants = await discoverMeals(rid);
    const myMenu = (restaurants.find(r => String(r.restaurantId) === String(rid))?.menu) || [];
    const myMap  = new Map(myMenu.map(p => [mealId(p), p]));
    const myIds  = new Set([...myMap.keys()].filter(Boolean));

    // 3) se l'endpoint ordini non filtrava lato server, filtriamo noi
    const orders = ordersUrl.includes("/restaurant/")
      || ordersUrl.includes("?restaurantId=")
      ? ordersRaw
      : ordersRaw.filter(o => normalizeOrderLines(o).some(l => myIds.has(l.mealId)));

    // 4) calcolo statistiche
    let countOrdersWithMine = 0;
    let totalItems = 0;
    let totalRevenue = 0;
    const soldByName = Object.create(null);

    for (const ord of orders) {
      const lines = normalizeOrderLines(ord);
      let hasMine = false;

      for (const ln of lines) {
        if (!myIds.has(ln.mealId)) continue;
        hasMine = true;

        const m = myMap.get(ln.mealId);
        const qty = Number(ln.qty || 1);
        const price = Number(ln.price ?? mealPrice(m));

        totalItems   += qty;
        totalRevenue += price * qty;

        const name = mealName(m);
        soldByName[name] = (soldByName[name] || 0) + qty;
      }

      if (hasMine) countOrdersWithMine++;
    }

    // 5) aggiorna DOM
    if (totOrdini)  totOrdini.textContent  = String(countOrdersWithMine);
    if (totPiatti)  totPiatti.textContent  = String(totalItems);
    if (totIncasso) totIncasso.textContent = money(totalRevenue);

    if (topUl) {
      const html = Object.entries(soldByName)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, qty]) => `<li>${name} — ${qty}×</li>`)
        .join("");
      topUl.innerHTML = html || "<li>No orders received.</li>";
    }
  } catch (err) {
    console.error("[STATISTICHE] errore:", err);
    if (topUl) topUl.innerHTML = "<li>⚠️ Error loading.</li>";
    if (errorBox) errorBox.textContent = err.message;

    // Messaggio extra in pagina quando manca la rotta /orders
    const box = document.getElementById("missing-orders-route");
    if (box) {
      box.innerHTML = `
        <div style="background:#fff3cd;color:#664d03;border:1px solid #ffecb5;padding:10px;border-radius:6px;">
          <strong>Endpoint /orders non trovato.</strong><br>
          Il backend pubblicato non espone <code>/orders</code> né <code>/api/orders</code>.
          Monta una di queste rotte oppure crea <code>/orders/restaurant/:id</code>.
        </div>
      `;
    }

    alert("Errore caricamento statistiche: " + err.message);
  }
});

