// statistiche_ristoratore.js

// --- Base URL per API: locale vs produzione ---
const isLocal =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";

const API_BASE = isLocal
  ? "http://localhost:3000"
  : (window.API_BASE // se lo hai già definito altrove, lo riusa
      || (location.origin.includes("onrender.com")
            ? "https://restaurant-management-wzhj.onrender.com"
            : location.origin));

// --- Helper fetch JSON con gestione errori ---
async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? " · " + body : ""}`);
  }
  return res.json();
}

// Normalizza ID piatto (string per confronto sicuro)
function mealId(p) {
  const id = p?.idmeals ?? p?.idMeal ?? p?.id ?? (typeof p?._id === "string" ? p._id : undefined);
  return id !== undefined && id !== null ? String(id) : undefined;
}

// Normalizza prezzo
function mealPrice(p) {
  const val = Number(p?.prezzo ?? p?.price ?? p?.costo ?? 0);
  return isNaN(val) ? 0 : val;
}

window.onload = async () => {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || user.role !== "ristoratore") {
    alert("Accesso riservato ai ristoratori");
    window.location.href = "login.html";
    return;
  }

  const totOrdini = document.getElementById("tot-ordini");
  const totPiatti = document.getElementById("tot-piatti");
  const totIncasso = document.getElementById("tot-incasso");
  const piattiPopolari = document.getElementById("piatti-popolari");

  // Set placeholder iniziali (facoltativo)
  if (totOrdini) totOrdini.textContent = "—";
  if (totPiatti) totPiatti.textContent = "—";
  if (totIncasso) totIncasso.textContent = "—";

  try {
    // 1) Carico ordini e menu (tutti i ristoranti)
    const [allOrders, allMeals] = await Promise.all([
      getJson("/orders"),
      getJson("/meals"),
    ]);

    // 2) Estraggo il menu del mio ristorante
    const mineMenu = (allMeals.find(r => r.restaurantId === user.restaurantId)?.menu) || [];
    const mineIds = new Set(mineMenu.map(mealId).filter(Boolean));

    // 3) Filtra ordini che contengono almeno un mio piatto
    const ordiniDelMioRistorante = allOrders.filter(o =>
      Array.isArray(o.meals) && o.meals.some(id => mineIds.has(String(id)))
    );

    // 4) Statistiche: conteggio piatti venduti + incasso
    const piattiVenduti = Object.create(null);
    let totalePiatti = 0;
    let totaleIncasso = 0;

    // Mappa veloce id->piatto
    const mapById = new Map(mineMenu.map(p => [mealId(p), p]));

    ordiniDelMioRistorante.forEach(ordine => {
      (ordine.meals || []).forEach(idRaw => {
        const id = String(idRaw);
        if (mapById.has(id)) {
          const piatto = mapById.get(id);
          totalePiatti++;
          totaleIncasso += mealPrice(piatto);
          const nome = piatto?.nome ?? piatto?.strMeal ?? piatto?.name ?? "Senza nome";
          piattiVenduti[nome] = (piattiVenduti[nome] || 0) + 1;
        }
      });
    });

    // 5) Riempimento DOM (mantiene le stesse funzionalità)
    if (totOrdini) totOrdini.textContent = String(ordiniDelMioRistorante.length);
    if (totPiatti) totPiatti.textContent = String(totalePiatti);
    if (totIncasso) totIncasso.textContent = `€${totaleIncasso.toFixed(2)}`;

    const topPiatti = Object.entries(piattiVenduti)
      .sort((a, b) => b[1] - a[1])
      .map(([nome, count]) => `<li>${nome} - ${count}x</li>`);

    if (piattiPopolari) {
      piattiPopolari.innerHTML = topPiatti.join("") || "<li>Nessun ordine ricevuto.</li>";
    }
  } catch (err) {
    console.error("Errore caricamento statistiche:", err);
    if (totOrdini) totOrdini.textContent = "Errore";
    if (totPiatti) totPiatti.textContent = "Errore";
    if (totIncasso) totIncasso.textContent = "Errore";
    if (piattiPopolari) piattiPopolari.innerHTML = "<li>⚠️ Errore nel caricamento.</li>";
    alert("Errore caricamento statistiche: " + err.message);
  }
};
