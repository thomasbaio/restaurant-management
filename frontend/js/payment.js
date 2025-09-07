// ====== Configurazione api base ======
const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = isLocalhost
  ? "http://localhost:3000"
  : "https://restaurant-management-wzhj.onrender.com"; // tua app su Render

// ====== utili ======
function parseExpiryToDate(expStr) {
  // supporta <input type="month"> (YYYY-MM) o stringhe tipo 2025-09
  // mette il giorno al 1° del mese per il confronto
  const [y, m] = (expStr || "").split("-").map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, 1, 23, 59, 59);
}

function toStringArray(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(x => (x == null ? "" : String(x).trim()))
    .filter(s => s.length > 0);
}

function calcTotal(items) {
  // items: [{price, qty}] opzionale
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
}

document.getElementById("payment-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const number = document.getElementById("card-number").value.trim();
  const holder = document.getElementById("card-holder").value.trim();
  const expiry = document.getElementById("expiry").value;
  const cvv = document.getElementById("cvv").value.trim();

  // --- validazioni carta ---
  if (!/^\d{16}$/.test(number)) {
    alert("Invalid card number (16 digits).");
    return;
  }
  if (!holder) {
    alert("Please enter the cardholder name.");
    return;
  }
  const expDate = parseExpiryToDate(expiry);
  if (!expDate) {
    alert("Invalid expiration date.");
    return;
  }
  const now = new Date();
  // la carta è valida se scade nel mese corrente o dopo
  if (expDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
    alert("The card has expired.");
    return;
  }
  if (!/^\d{3}$/.test(cvv)) {
    alert("Invalid CVV (3 digits).");
    return;
  }

  // --- ordine in sospeso ---
  const ordine = JSON.parse(localStorage.getItem("pendingOrder"));
  if (!ordine) {
    alert("No pending order to pay.");
    return;
  }

  // --- utente loggato (serve username per /orders) ---
  const user = JSON.parse(localStorage.getItem("loggedUser")) || {};
  const username = user?.username || ordine?.username;
  if (!username) {
    alert("Unable to determine the order's user (missing username).");
    return;
  }

  // --- ricava restaurantId dal pendingOrder (impostato in order.js) ---
  const restaurantId =
    ordine.restaurantId ||
    (Array.isArray(ordine.items) && ordine.items[0]?.restaurantId) ||
    null;

  if (!restaurantId) {
    alert("Unable to determine restaurantId for this order.");
    return;
  }

  // --- normalizzazione payload atteso dal backend ---
  // supporta sia pendingOrder.meals (array di id) sia pendingOrder.items (oggetti con id/price/qty)
  let meals = [];
  let total = 0;

  if (Array.isArray(ordine.meals)) {
    meals = toStringArray(ordine.meals); // id come stringhe
  }

  if ((!meals || meals.length === 0) && Array.isArray(ordine.items)) {
    // se abbiamo items con {idmeals|id, price, qty}
    meals = toStringArray(ordine.items.map(it => it.idmeals ?? it.id ?? it._id));
    total = Number(ordine.total) || calcTotal(ordine.items);
  } else {
    total = Number(ordine.total) || 0;
  }

  if (!meals || meals.length === 0) {
    alert("The order has no dishes (meals is empty).");
    return;
  }

  const payload = {
    username,
    restaurantId,          //  necessario per il backend
    meals,                 //  array di stringhe
    total,
    payment: "carta_credito", // accettato e normalizzato lato server
    status: "ordinato",
    createdAt: new Date().toISOString()
  };

  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });

    // se il server risponde con errore, mostro status + body per debug
    if (!res.ok) {
      let text = await res.text();
      try {
        const asJson = JSON.parse(text);
        text = JSON.stringify(asJson);
      } catch { /* lascio text così com'è */ }
      console.error("POST /orders failed", res.status, text);
      alert(`Order creation error (HTTP ${res.status}). See console for details.`);
      throw new Error(text || `HTTP ${res.status}`);
    }

    const ordineConfermato = await res.json();

    localStorage.setItem("lastConfirmedOrder", JSON.stringify(ordineConfermato));
    localStorage.removeItem("pendingOrder");

    alert(" Payment successful!");
    window.location.href = "conferma.html";
  } catch (err) {
    console.error("Error during order submission:", err);
    alert(" Error completing payment. Check the console for details.");
  }
});
