// ====== Configurazione api base ======
const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = isLocalhost
  ? "http://localhost:3000"
  : "https://restaurant-management-wzhj.onrender.com";

// ====== utili ======
function parseExpiryToDate(expStr) {
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
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
}

// ---- fallback: ricava restaurantId dai /meals ----
async function inferRestaurantIdFromAPI(mealIds) {
  if (!Array.isArray(mealIds) || mealIds.length === 0) return null;

  // prova /meals e /api/meals
  const paths = ["/meals", "/api/meals"];
  let data = null, lastErr = null;
  for (const p of paths) {
    try {
      const res = await fetch(`${API_BASE}${p}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      data = await res.json();
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!data) {
    console.warn("inferRestaurantIdFromAPI: fetch failed", lastErr);
    return null;
  }

  const wanted = new Set(mealIds.map(String));

  // struttura attesa: [{restaurantId, menu:[{idmeals|id|_id, ...}]}, ...]
  if (Array.isArray(data)) {
    for (const r of data) {
      const rid = String(r?.restaurantId ?? r?.id ?? r?._id ?? "");
      const menu = Array.isArray(r?.menu) ? r.menu : [];
      for (const p of menu) {
        const pid = String(p?.idmeals ?? p?.id ?? p?._id ?? "");
        if (pid && wanted.has(pid)) return rid || null;
      }
    }
  } else if (data && typeof data === "object") {
    // fallback ricorsivo minimale
    const stack = [data];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== "object") continue;
      if (Array.isArray(cur.menu)) {
        const rid = String(cur.restaurantId ?? cur.id ?? cur._id ?? "");
        for (const p of cur.menu) {
          const pid = String(p?.idmeals ?? p?.id ?? p?._id ?? "");
          if (pid && wanted.has(pid)) return rid || null;
        }
      }
      for (const v of Object.values(cur)) {
        if (v && typeof v === "object") stack.push(v);
        if (Array.isArray(v)) v.forEach(x => x && typeof x === "object" && stack.push(x));
      }
    }
  }
  return null;
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

  // --- utente ---
  const user = JSON.parse(localStorage.getItem("loggedUser")) || {};
  const username = user?.username || ordine?.username;
  if (!username) {
    alert("Unable to determine the order's user (missing username).");
    return;
  }

  // --- meals + total ---
  let meals = [];
  let total = 0;

  if (Array.isArray(ordine.meals)) {
    meals = toStringArray(ordine.meals); // id piatto come stringhe
  }
  if ((!meals || meals.length === 0) && Array.isArray(ordine.items)) {
    meals = toStringArray(ordine.items.map(it => it.idmeals ?? it.id ?? it._id));
    total = Number(ordine.total) || calcTotal(ordine.items);
  } else {
    total = Number(ordine.total) || 0;
  }

  if (!meals || meals.length === 0) {
    alert("The order has no dishes (meals is empty).");
    return;
  }

  // --- restaurantId: prova pendingOrder, poi fallback da /meals ---
  let restaurantId =
    ordine.restaurantId ||
    (Array.isArray(ordine.items) && ordine.items[0]?.restaurantId) ||
    null;

  if (!restaurantId) {
    try {
      restaurantId = await inferRestaurantIdFromAPI(meals);
    } catch (e2) {
      console.warn("inferRestaurantIdFromAPI failed:", e2);
    }
  }

  if (!restaurantId) {
    // probabile pendingOrder vecchio: pulisco per evitare loop
    console.warn("Missing restaurantId in pendingOrder. Cleaning old pendingOrder.");
    // localStorage.removeItem("pendingOrder"); // opzionale
    alert("Unable to determine restaurantId for this order.");
    return;
  }

  const payload = {
    username,
    restaurantId,          //  richiesto dal backend
    meals,                 //  array di stringhe
    total,
    payment: "carta_credito",
    status: "ordinato",
    createdAt: new Date().toISOString()
  };

  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      let text = await res.text();
      try { text = JSON.stringify(JSON.parse(text)); } catch {}
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
