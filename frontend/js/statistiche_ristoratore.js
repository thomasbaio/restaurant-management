// ========================= Base URL =========================
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = isLocal
  ? "http://localhost:3000"
  : (window.API_BASE ||
     (location.origin.includes("onrender.com")
        ? "https://restaurant-management-wzhj.onrender.com"
        : location.origin));

// ========================= Fetch helpers =========================
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

async function tryMany(urls) {
  let lastErr = null;
  for (const u of urls) {
    try { return await fetchJSON(u); }
    catch (e) { console.warn("[STATISTICHE] fallito", u, e.message); lastErr = e; }
  }
  throw lastErr || new Error("Nessuna rotta disponibile");
}

// ========================= Normalizzatori =========================
const str = (v) => (v === undefined || v === null) ? undefined : String(v);

function mealId(p) {
  return str(p?.idmeals ?? p?.idMeal ?? p?.id ?? p?._id);
}

function mealName(p) {
  return p?.nome ?? p?.strMeal ?? p?.name ?? p?.title ?? "Unnamed";
}

function mealPrice(p) {
  const n = Number(p?.prezzo ?? p?.price ?? p?.costo ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(n) {
  return `€${Number(n || 0).toFixed(2)}`;
}

// Estrae righe ordine in forma normalizzata: [{mealId, qty, price}]
function normalizeOrderLines(order) {
  const out = [];

  // Caso A: semplici ID dei piatti in array (es: ["id1","id2"])
  if (Array.isArray(order.meals)) {
    for (const id of order.meals) out.push({ mealId: str(id), qty: 1, price: undefined });
  }
  if (Array.isArray(order.dishes)) {
    for (const id of order.dishes) out.push({ mealId: str(id), qty: 1, price: undefined });
  }
  if (Array.isArray(order.items)) {
    // items può essere array di ID o array di oggetti
    for (const it of order.items) {
      if (typeof it === "string" || typeof it === "number") {
        out.push({ mealId: str(it), qty: 1, price: undefined });
      } else if (it && (it.mealId || it.id || it._id)) {
        out.push({
          mealId: str(it.mealId ?? it.id ?? it._id),
          qty: Number(it.qty ?? it.quantity ?? 1) || 1,
          price: Number(it.price ?? it.prezzo)
        });
      }
    }
  }

  // Caso B: altre chiavi comuni (lines, products, cart)
  const candidates = ["lines", "products", "cart"];
  for (const key of candidates) {
    const arr = order?.[key];
    if (Array.isArray(arr)) {
      for (const it of arr) {
        out.push({
          mealId: str(it?.mealId ?? it?.id ?? it?._id ?? it?.productId),
          qty: Number(it?.qty ?? it?.quantity ?? 1) || 1,
          price: Number(it?.price ?? it?.prezzo)
        });
      }
    }
  }

  return out.filter(x => x.mealId);
}

// ========================= Main =========================
window.addEventListener("load", async () => {
  // --- auth ---
  let user = null;
  try { user = JSON.parse(localStorage.getItem("loggedUser") || "null"); } catch {}
  if (!user || user.role !== "ristoratore") {
    alert("Access reserved for restaurateurs");
    location.href = "login.html";
    return;
  }

  const rid = user.restaurantId || user._id || "r_o";

  // --- DOM refs ---
  const totOrdini    = document.getElementById("tot-ordini");
  const totPiatti    = document.getElementById("tot-piatti");
  const totIncasso   = document.getElementById("tot-incasso");
  const piattiTopUl  = document.getElementById("piatti-popolari");
  const errorBox     = document.getElementById("stats-error");

  // placeholders
  if (totOrdini)  totOrdini.textContent  = "—";
  if (totPiatti)  totPiatti.textContent  = "—";
  if (totIncasso) totIncasso.textContent = "—";
  if (piattiTopUl) piattiTopUl.innerHTML = "<li class='muted'>Loading…</li>";
  if (errorBox) errorBox.textContent = "";

  try {
    // ------ 1) ORDERS (prova più rotte) ------
    const orders = await tryMany([
      `${API_BASE}/orders?restaurantId=${encodeURIComponent(rid)}`,
      `${API_BASE}/api/orders?restaurantId=${encodeURIComponent(rid)}`,
      `${API_BASE}/orders/restaurant/${encodeURIComponent(rid)}`,
      `${API_BASE}/api/orders/restaurant/${encodeURIComponent(rid)}`
    ]);

    // ------ 2) MEALS (prova più rotte) ------
    const mealsData = await tryMany([
      `${API_BASE}/meals`,
      `${API_BASE}/meals/common-meals`,
      `${API_BASE}/api/meals`
    ]);

    // Normalizza struttura pasti/ristoranti
    let restaurants = [];
    if (Array.isArray(mealsData) && mealsData[0]?.menu) {
      restaurants = mealsData;                         // [{restaurantId, menu:[...]}]
    } else if (Array.isArray(mealsData)) {
      restaurants = [{ restaurantId: rid, menu: mealsData }];  // piatti comuni
    } else if (mealsData?.restaurants) {
      restaurants = mealsData.restaurants;
    }

    const myMenu = (restaurants.find(r => String(r.restaurantId) === String(rid))?.menu) || [];
    const myMap  = new Map(myMenu.map(p => [mealId(p), p]));   // id -> info piatto
    const myIds  = new Set([...myMap.keys()].filter(Boolean));

    // ------ 3) Statistiche per il mio ristorante ------
    let countOrdersWithMine = 0;  // # ordini che hanno almeno un mio piatto
    let totalItems = 0;           // # piatti miei venduti (somma delle qty)
    let totalRevenue = 0;         // incasso solo dei miei piatti
    const soldByName = Object.create(null); // "Nome piatto" -> qty

    for (const ord of (Array.isArray(orders) ? orders : [])) {
      const lines = normalizeOrderLines(ord);
      let hasMine = false;

      for (const line of lines) {
        if (!myIds.has(line.mealId)) continue;

        hasMine = true;
        const piatto = myMap.get(line.mealId);
        const qty = Number(line.qty || 1);
        const price = Number(line.price ?? mealPrice(piatto));
        const name = mealName(piatto);

        totalItems   += qty;
        totalRevenue += price * qty;
        soldByName[name] = (soldByName[name] || 0) + qty;
      }

      if (hasMine) countOrdersWithMine++;
    }

    // ------ 4) Output DOM ------
    if (totOrdini)  totOrdini.textContent  = String(countOrdersWithMine);
    if (totPiatti)  totPiatti.textContent  = String(totalItems);
    if (totIncasso) totIncasso.textContent = money(totalRevenue);

    if (piattiTopUl) {
      const top = Object.entries(soldByName)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, qty]) => `<li>${name} — ${qty}×</li>`)
        .join("");

      piattiTopUl.innerHTML = top || "<li class='muted'>No orders received.</li>";
    }
  } catch (err) {
    console.error("[STATISTICHE] errore:", err);
    if (totOrdini)  totOrdini.textContent  = "—";
    if (totPiatti)  totPiatti.textContent  = "—";
    if (totIncasso) totIncasso.textContent = "—";
    if (piattiTopUl) piattiTopUl.innerHTML = "<li>⚠️ Error loading.</li>";
    if (errorBox) errorBox.textContent = err.message;
    alert("Errore caricamento statistiche: " + err.message);
  }
});
