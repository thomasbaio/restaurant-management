// ====== CONFIG API BASE ======
const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = isLocalhost
  ? "http://localhost:3000"
  : "https://restaurant-management-wzhj.onrender.com"; // tua app su Render

// ====== UTIL ======
function parseExpiryToDate(expStr) {
  // Supporta <input type="month"> (YYYY-MM) o stringhe tipo 2025-09
  // Mette il giorno al 1° del mese per il confronto
  const [y, m] = (expStr || "").split("-").map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, 1, 23, 59, 59);
}

function toNumberArray(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(x => (typeof x === "string" ? x.trim() : x))
    .map(x => Number(x))
    .filter(n => Number.isFinite(n));
}

function calcTotal(items) {
  // items: [{price, qty}] opzionale
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
}

// ====== HANDLER ======
document.getElementById("payment-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const number = document.getElementById("card-number").value.trim();
  const holder = document.getElementById("card-holder").value.trim();
  const expiry = document.getElementById("expiry").value;
  const cvv = document.getElementById("cvv").value.trim();

  // --- Validazioni carta ---
  if (!/^\d{16}$/.test(number)) {
    alert("Numero carta non valido (16 cifre).");
    return;
  }
  if (!holder) {
    alert("Inserisci l'intestatario della carta.");
    return;
  }
  const expDate = parseExpiryToDate(expiry);
  if (!expDate) {
    alert("Data di scadenza non valida.");
    return;
  }
  const now = new Date();
  // la carta è valida se scade nel mese corrente o dopo
  if (expDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
    alert("La carta è scaduta.");
    return;
  }
  if (!/^\d{3}$/.test(cvv)) {
    alert("CVV non valido (3 cifre).");
    return;
  }

  // --- Ordine in sospeso ---
  const ordine = JSON.parse(localStorage.getItem("pendingOrder"));
  if (!ordine) {
    alert("Nessun ordine in sospeso da pagare.");
    return;
  }

  // --- Utente loggato (serve username per /orders) ---
  const user = JSON.parse(localStorage.getItem("loggedUser")) || {};
  const username = user?.username || ordine?.username;
  if (!username) {
    alert("Impossibile determinare l'utente dell'ordine (username mancante).");
    return;
  }

  // --- Normalizzazione payload atteso dal backend ---
  // Supporta sia pendingOrder.meals (array di id) sia pendingOrder.items (oggetti con id/price/qty)
  let meals = [];
  let total = 0;

  if (Array.isArray(ordine.meals)) {
    meals = toNumberArray(ordine.meals);
  }

  if ((!meals || meals.length === 0) && Array.isArray(ordine.items)) {
    // se abbiamo items con {idmeals|id, price, qty}
    meals = toNumberArray(ordine.items.map(it => it.idmeals ?? it.id));
    total = Number(ordine.total) || calcTotal(ordine.items);
  } else {
    total = Number(ordine.total) || 0;
  }

  if (!meals || meals.length === 0) {
    alert("L'ordine non contiene piatti (meals è vuoto).");
    return;
  }

  const payload = {
    username,
    meals,
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

    // Se il server risponde con errore, mostro status + body per debug
    if (!res.ok) {
      let text = await res.text();
      try {
        const asJson = JSON.parse(text);
        text = JSON.stringify(asJson);
      } catch { /* lascio text così com'è */ }
      console.error("POST /orders failed", res.status, text);
      alert(`Errore creazione ordine (HTTP ${res.status}). Dettagli in console.`);
      throw new Error(text || `HTTP ${res.status}`);
    }

    const ordineConfermato = await res.json();

    localStorage.setItem("lastConfirmedOrder", JSON.stringify(ordineConfermato));
    localStorage.removeItem("pendingOrder");

    alert("✅ Pagamento effettuato con successo!");
    window.location.href = "conferma.html";
  } catch (err) {
    console.error("Errore durante l'invio dell'ordine:", err);
    alert("❌ Errore nel completare il pagamento. Controlla la console per i dettagli.");
  }
});
