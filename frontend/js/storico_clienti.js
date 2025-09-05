// Base URL per API: locale vs Render
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : "https://restaurant-management-wzhj.onrender.com";

// ---- fetch helper con timeout + error handling
async function apiGet(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000); // 12s timeout
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: ctrl.signal, mode: "cors" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${body ? " – " + body : ""}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ---- utils
const money = n => `€${Number(n || 0).toFixed(2)}`;
const when  = d => { try { return new Date(d).toLocaleString(); } catch { return ""; } };
const normId = o => o?.id ?? o?._id ?? "";
const normStatus = o => String(o?.status ?? o?.state ?? o?.stato ?? "ordinato").toLowerCase();

// stati finali (storico)
const FINAL = new Set(["consegnato", "ritirato", "annullato"]);

// ---- normalizza /meals -> mappa { id -> {nome, prezzo} }
function buildMealsMap(rawMeals) {
  const map = new Map();
  const isDish = r => (r?.idmeals || r?.id || r?._id || r?.idMeal);
  const allDishes = Array.isArray(rawMeals)
    ? rawMeals.flatMap(r => Array.isArray(r?.menu) ? r.menu : (isDish(r) ? [r] : []))
    : [];

  for (const p of allDishes) {
    const id = p.idmeals ?? p.idMeal ?? p.id ?? p._id;
    if (!id) continue;
    const key = String(id);
    const nome = p.nome ?? p.strMeal ?? p.name ?? `Piatto #${key}`;
    let prezzo = p.prezzo ?? p.price;
    prezzo = (typeof prezzo === "string") ? Number(prezzo) : prezzo;
    map.set(key, { nome, prezzo: Number.isFinite(prezzo) ? Number(prezzo) : null });
  }
  return map;
}

// ---- rendering item list e totale
function renderItemsAndTotal(order, mealsMap) {
  // Preferisci snapshot items (name/price/qty)
  if (Array.isArray(order.items) && order.items.length) {
    let tot = 0;
    const parts = order.items.map(it => {
      const q = Number(it.qty || 1);
      const pr = Number(it.price || 0);
      tot += q * pr;
      return `${it.name ?? "Piatto"} x${q} (${money(pr)})`;
    });
    return { text: parts.join(", "), total: tot };
  }
  // Fallback: ricava da meals id -> nome/prezzo
  const ids = Array.isArray(order.meals) ? order.meals : [];
  let tot = 0;
  const parts = ids.map(id => {
    const info = mealsMap.get(String(id));
    if (!info) return `Piatto ID ${id}`;
    if (Number.isFinite(info.prezzo)) tot += info.prezzo;
    return `${info.nome}${Number.isFinite(info.prezzo) ? " (" + money(info.prezzo) + ")" : ""}`;
  });
  return { text: parts.join(", "), total: tot || order.total || 0 };
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

    // separa attivi / passati
    const attivi = safeOrders.filter(o => !FINAL.has(normStatus(o)));
    const passati = safeOrders.filter(o => FINAL.has(normStatus(o)));

    const render = (ordini, container) => {
      if (!ordini.length) {
        container.innerHTML = "<li>-- Nessun ordine --</li>";
        return;
      }
      // ordina per data desc se possibile
      ordini.sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));

      container.innerHTML = ordini.map(o => {
        const stato = normStatus(o);
        const { text, total } = renderItemsAndTotal(o, mealsMap);
        const delivery = (o.delivery ?? o.tipoConsegna) === "domicilio"
          ? (o.address ?? o.indirizzo ?? "Consegna a domicilio")
          : "Ritiro al ristorante";
        const created = o.createdAt ? when(o.createdAt) : "n/d";
        const closed  = (o.closedAt || o.deliveredAt || o.ritiratoAt) ? when(o.closedAt || o.deliveredAt || o.ritiratoAt) : "—";

        return `
          <li>
            <strong>ID:</strong> ${normId(o)}<br>
            🕒 Creato: ${created}${FINAL.has(stato) ? ` · Chiuso: ${closed}` : ""}<br>
            🧾 Stato: ${stato}<br>
            🍽️ Piatti: ${text || "—"}<br>
            💶 Totale: ${money(o.total || total)}<br>
            📍 ${delivery}
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
