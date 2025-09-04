// Base URL per API: locale vs produzione
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal
  ? "http://localhost:3000"
  : "https://restaurant-management-wzhj.onrender.com";

// Helper fetch JSON con messaggi d'errore decenti
async function fetchJSON(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${path} – ${text}`);
  }
  return res.json();
}

window.onload = async () => {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || user.role !== "ristoratore") {
    alert("Accesso riservato ai ristoratori.");
    window.location.href = "login.html";
    return;
  }

  const container = document.getElementById("ordine-lista");

  try {
    // 1) Carico ordini e piatti
    const [orders, mealsDataRaw] = await Promise.all([
      fetchJSON("/orders"),
      fetchJSON("/meals") // se il tuo backend espone /meals/common-meals, cambia qui
    ]);

    // 2) Normalizzo la struttura dei piatti/ristoranti
    // - Caso A: /meals restituisce un array di ristoranti con { restaurantId, menu: [...] }
    // - Caso B: /meals restituisce direttamente un array "piatti comuni" (senza ristoranti)
    let restaurants = [];
    if (Array.isArray(mealsDataRaw) && mealsDataRaw.length && mealsDataRaw[0]?.menu) {
      restaurants = mealsDataRaw; // Caso A
    } else if (Array.isArray(mealsDataRaw) && mealsDataRaw.length && !mealsDataRaw[0]?.menu) {
      // Caso B (piatti comuni) → creo un finto container solo per non rompere la logica
      restaurants = [{ restaurantId: user.restaurantId, menu: mealsDataRaw }];
    } else if (mealsDataRaw?.restaurants) {
      restaurants = mealsDataRaw.restaurants;
    } else {
      restaurants = [];
    }

    // 3) Piatti del ristorante loggato
    const mieiPiatti = (restaurants.find(r => String(r.restaurantId) === String(user.restaurantId))?.menu) || [];

    // 4) Ordini che contengono almeno un piatto del ristorante
    const ordiniFiltrati = orders.filter(order =>
      Array.isArray(order.meals) &&
      order.meals.some(id => mieiPiatti.some(p => String(p.idmeals ?? p.id ?? p._id) === String(id)))
    );

    if (ordiniFiltrati.length === 0) {
      container.innerHTML = "<p>Nessun ordine trovato per il tuo ristorante.</p>";
      return;
    }

    container.innerHTML = "";

    for (const ordine of ordiniFiltrati) {
      const div = document.createElement("div");
      div.style.border = "1px solid #ccc";
      div.style.marginBottom = "15px";
      div.style.padding = "10px";
      div.style.borderRadius = "6px";
      div.style.backgroundColor = "#f9f9f9";

      const piatti = (ordine.meals || []).map(id => {
        const trovato = mieiPiatti.find(
          p => String(p.idmeals ?? p.id ?? p._id) === String(id)
        );
        return trovato ? (trovato.nome ?? trovato.strMeal ?? "Piatto") : "(piatto non tuo)";
      });

      const statoId = `stato-${ordine.id ?? ordine._id}`;
      const orderId = ordine.id ?? ordine._id;

      div.innerHTML = `
        <p><strong>Cliente:</strong> ${ordine.username ?? ordine.user ?? "—"}</p>
        <p><strong>Stato:</strong> <span id="${statoId}">${ordine.status}</span></p>
        <p><strong>Ritiro:</strong> ${ordine.delivery ?? "—"}</p>
        <p><strong>Pagamento:</strong> ${ordine.payment ?? "—"}</p>
        <p><strong>Piatti:</strong><br> ${piatti.map(p => `🍽️ ${p}`).join("<br>")}</p>
        ${ordine.status !== "consegnato"
          ? `<button onclick="aggiornaStato('${orderId}', '${ordine.status}', '${statoId}')">Avanza stato</button>`
          : ""
        }
      `;

      container.appendChild(div);
    }

  } catch (err) {
    console.error(err);
    container.innerHTML = `<p>Errore nel caricamento ordini o piatti.<br><small>${err.message}</small></p>`;
  }
};

// 🔄 Stato ordine: ordinato → in preparazione → consegnato
async function aggiornaStato(id, statoAttuale, domSpanId) {
  const next = {
    "ordinato": "in preparazione",
    "in preparazione": "consegnato"
  }[statoAttuale];

  if (!next) return;

  try {
    const res = await fetch(`${API_BASE}/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next })
    });

    if (res.ok) {
      // aggiorno lo span del singolo ordine
      const span = document.getElementById(domSpanId || `stato-${id}`);
      if (span) span.textContent = next;
    } else {
      const text = await res.text().catch(() => "");
      alert("Errore nel cambio di stato. " + text);
    }
  } catch (err) {
    console.error(err);
    alert("Errore rete nel cambiare lo stato.");
  }
}
