// Base URL per API
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : "https://restaurant-management-wzhj.onrender.com";

// ---- fetch helper con timeout + error handling
async function apiGet(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
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
const money   = n => `€${Number(n || 0).toFixed(2)}`;
const when    = d => { try { return new Date(d).toLocaleString(); } catch { return ""; } };
const normId  = o => o?.id ?? o?._id ?? "";
const normStatus = o => String(o?.status ?? o?.state ?? o?.stato ?? "ordinato").toLowerCase();

// stati finali (storico)
const FINAL = new Set(["consegnato","ritirato","annullato","delivered","withdrawn","canceled","cancelled"]);

// ---- normalizza /meals -> mappa { id -> {nome, prezzo} }
function buildMealsMap(rawMeals) {
  const map = new Map();
  const isDish = r => (r?.idmeals || r?.id || r?._id || r?.idMeal);
  const allDishes = Array.isArray(rawMeals)
    ? rawMeals.flatMap(r => Array.isArray(r?.menu) ? r.menu : (isDish(r) ? [r] : []))
    : [];

  for (const p of allDishes) {
    const id = p.idmeals ?? p.idMeal ?? p.id ?? p._id;
    if (id == null) continue;
    const key = String(id);
    const nome = p.nome ?? p.strMeal ?? p.name ?? `Dish #${key}`;
    let prezzo = p.prezzo ?? p.price;
    prezzo = (typeof prezzo === "string") ? Number(prezzo) : prezzo;
    map.set(key, { nome, prezzo: Number.isFinite(prezzo) ? Number(prezzo) : 0 });
  }
  return map;
}

// ------- helpers robusti per items/id/qty -------
const getQty = it => Number(it?.qty ?? it?.quantity ?? it?.quantita ?? it?.q ?? 1) || 1;
const getItemId = it => it?.mealId ?? it?.idmeal ?? it?.idmeals ?? it?.idMeal ?? it?.id ?? it?._id;
const getItemNameFromSnapshot = it => it?.name ?? it?.nome ?? it?.strMeal || "";

// Estrae array di id dai vari formati di `meals`
function extractIdsFromMeals(meals) {
  if (!Array.isArray(meals)) return [];
  return meals.map(m => (typeof m === "object" && m !== null) ? getItemId(m) : m);
}

// ---- rende l’elenco piatti + totale (robusto)
function renderItemsAndTotal(order, mealsMap) {
  let total = 0;
  let parts = [];
  const mealsIdsByIndex = extractIdsFromMeals(order.meals);

  if (Array.isArray(order.items) && order.items.length) {
    parts = order.items.map((it, idx) => {
      // id: dall'item oppure dal parallelo meals[idx]
      const id  = getItemId(it) ?? mealsIdsByIndex[idx];
      const cat = id != null ? mealsMap.get(String(id)) : null;

      // nome: snapshot -> catalogo -> fallback
      let name = getItemNameFromSnapshot(it);
      const noName = !name || ["senza nome","unnamed","dish"].includes(String(name).trim().toLowerCase());
      if (noName) name = cat?.nome || (id != null ? `Dish #${id}` : "Dish");

      const qty   = getQty(it);
      const price = Number(it.prezzo ?? it.price ?? cat?.prezzo ?? 0) || 0;

      total += price * qty;
      return `${name} x${qty} (${money(price)})`;
    });
  } else if (Array.isArray(order.meals) && order.meals.length) {
    parts = order.meals.map(m => {
      const id  = (typeof m === "object") ? getItemId(m) : m;
      const qty = (typeof m === "object") ? getQty(m) : 1;
      const cat = id != null ? mealsMap.get(String(id)) : null;

      const name  = cat?.nome || (id != null ? `Dish #${id}` : "Dish");
      const price = Number(cat?.prezzo ?? 0) || 0;

      total += price * qty;
      return `${name} x${qty} (${money(price)})`;
    });
  } else {
    // nessuna info: usa total dell’ordine se presente
    return { text: "—", total: Number(order.total) || 0 };
  }

  return { text: parts.join(", "), total };
}

window.onload = async () => {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || user.role !== "cliente") {
    alert("Access reserved for customers");
    window.location.href = "login.html";
    return;
  }

  const attiviList = document.getElementById("attivi-list");
  const passatiList = document.getElementById("passati-list");

  attiviList.innerHTML = "<li>Loading orders...</li>";
  passatiList.innerHTML = "<li>Loading orders...</li>";

  try {
    const [orders, mealsRaw] = await Promise.all([
      apiGet(`/orders?username=${encodeURIComponent(user.username)}`),
      apiGet(`/meals`)
    ]);

    const mealsMap   = buildMealsMap(mealsRaw);
    const safeOrders = Array.isArray(orders) ? orders : [];

    if (safeOrders.length === 0) {
      attiviList.innerHTML = "<li>No orders.</li>";
      passatiList.innerHTML = "<li>No completed orders.</li>";
      return;
    }

    // separa attivi / passati
    const attivi  = safeOrders.filter(o => !FINAL.has(normStatus(o)));
    const passati = safeOrders.filter(o =>  FINAL.has(normStatus(o)));

    const render = (ordini, container) => {
      if (!ordini.length) {
        container.innerHTML = "<li>-- No orders --</li>";
        return;
      }
      ordini.sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));

      container.innerHTML = ordini.map(o => {
        const stato = normStatus(o);
        const { text, total } = renderItemsAndTotal(o, mealsMap);

        const created = o.createdAt ? when(o.createdAt) : "n/a";
        const closed  = (o.closedAt || o.deliveredAt || o.ritiratoAt) ? when(o.closedAt || o.deliveredAt || o.ritiratoAt) : "—";
        const delivery = "Pickup at restaurant"; // solo ritiro in store

        return `
          <li>
            <strong>ID:</strong> ${normId(o)}<br>
            Created: ${created}${FINAL.has(stato) ? ` · Closed: ${closed}` : ""}<br>
            Status: ${stato}<br>
            Dishes: ${text}<br>
            Total: ${money(o.total || total)}<br>
            ${delivery}
          </li>
        `;
      }).join("");
    };

    render(attivi, attiviList);
    render(passati, passatiList);

  } catch (err) {
    console.error("Errore nel caricamento:", err);
    const hint = isLocal
      ? "Make sure the local backend is running at http://localhost:3000."
      : "Make sure the backend on Render is online.";
    attiviList.innerHTML  = `<li style="color:#b00">Error while loading: ${err?.message ?? err}. ${hint}</li>`;
    passatiList.innerHTML = `<li style="color:#b00">Error while loading: ${err?.message ?? err}. ${hint}</li>`;
  }
};
