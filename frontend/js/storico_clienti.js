// Base URL per API: locale vs Render
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : "https://restaurant-management-wzhj.onrender.com";

// fetch helper con timeout + error handling
async function apiGet(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000); // 12s timeout
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: ctrl.signal, mode: "cors" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} ${body ? "– " + body : ""}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// normalizza /meals -> mappa { id -> {nome, prezzo} }
function buildMealsMap(rawMeals) {
  const map = new Map();

  // /meals può tornare:
  // 1) array di ristoranti [{ restaurantId, menu: [...] }, ...]
  // 2) direttamente un array di piatti
  const allDishes = Array.isArray(rawMeals)
    ? rawMeals.flatMap(r => Array.isArray(r?.menu) ? r.menu : (r?.idmeals || r?.id || r?._id ? [r] : []))
    : [];

  for (const p of allDishes) {
    const id = (p.idmeals ?? p.idMeal ?? p.id ?? p._id);
    if (!id) continue;
    const key = String(id);
    const nome = p.nome ?? p.strMeal ?? p.name ?? `Piatto #${key}`;
    const prezzoNum = typeof p.prezzo === "number"
      ? p.prezzo
      : (typeof p.price === "number" ? p.price : NaN);
    map.set(key, { nome, prezzo: isFinite(prezzoNum) ? prezzoNum : null });
  }
  return map;
}

window.onload = async () => {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || user.role !== "cliente") {
    alert("Accesso riservato ai clienti");
    window.location.href = "login.html";
    return;
  }

  const attiviList = document.getElementById("attivi-list");
  const passatiList = document.getElementById("passati-list");

  // stato iniziale
  attiviList.innerHTML = "<li>Caricamento ordini in corso...</li>";
  passatiList.innerHTML = "<li>Caricamento ordini in corso...</li>";

  try {
    const [orders, mealsRaw] = await Promise.all([
      apiGet(`/orders?username=${encodeURIComponent(user.username)}`),
      apiGet(`/meals`)
    ]);

    const mealsMap = buildMealsMap(mealsRaw);
    const safeOrders = Array.isArray(orders) ? orders : [];

    if (safeOrders.length === 0) {
      attiviList.innerHTML = "<li>Nessun ordine presente.</li>";
      passatiList.innerHTML = "<li>Nessun ordine concluso.</li>";
      return;
    }

    const getPiattoNomePrezzo = (id) => {
      const info = mealsMap.get(String(id));
      if (!info) return "Sconosciuto";
      const price = info.prezzo != null ? ` (€${info.prezzo.toFixed(2)})` : "";
      return `${info.nome}${price}`;
    };

    const attivi = safeOrders.filter(o => (o.status ?? o.stato) !== "consegnato");
    const passati = safeOrders.filter(o => (o.status ?? o.stato) === "consegnato");

    const render = (ordini, container) => {
      if (!ordini.length) {
        container.innerHTML = "<li>-- Nessun ordine --</li>";
        return;
      }
      container.innerHTML = ordini.map(o => {
        const oid = o.id ?? o._id ?? "";
        const stato = o.status ?? o.stato ?? "ordinato";
        const items = Array.isArray(o.meals) ? o.meals.map(getPiattoNomePrezzo).join(", ") : "—";
        const consegna = (o.delivery ?? o.tipoConsegna) === "domicilio"
          ? (o.address ?? o.indirizzo ?? "Consegna a domicilio")
          : "Ritiro al ristorante";
        return `
          <li>
            <strong>ID:</strong> ${oid}<br>
            🧾 Stato: ${stato}<br>
            🍽️ Piatti: ${items}<br>
            📍 ${consegna}
          </li>
        `;
      }).join("");
    };

    render(attivi, attiviList);
    render(passati, passatiList);

  } catch (err) {
    console.error("Errore nel caricamento:", err);
    const hint = isLocal
      ? "Verifica che il backend locale sia attivo su http://localhost:3000."
      : "Verifica che il backend su Render sia online.";
    attiviList.innerHTML = `<li style="color:#b00">Errore durante il caricamento: ${err?.message ?? err}. ${hint}</li>`;
    passatiList.innerHTML = `<li style="color:#b00">Errore durante il caricamento: ${err?.message ?? err}. ${hint}</li>`;
  }
};
