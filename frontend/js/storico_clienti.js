// ========= base url per API =========
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : "https://restaurant-management-wzhj.onrender.com";

// ========= fetch helper con timeout =========
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

// ========= utils =========
const money     = n => `€${Number(n || 0).toFixed(2)}`;
const when      = d => { try { return new Date(d).toLocaleString(); } catch { return ""; } };
const normId    = o => o?.id ?? o?._id ?? "";
const normState = o => String(o?.status ?? o?.state ?? o?.stato ?? "ordinato").toLowerCase();

// label inglesi per gli stati
const labelStatus = s => {
  const t = String(s || "").toLowerCase();
  const map = {
    ordinato: "Ordered",
    preparazione: "Preparing",
    consegna: "Ready for pickup",
    consegnato: "Delivered",
    ritirato: "Picked up",
    annullato: "Canceled",
    withdrawn: "Picked up",
    delivered: "Delivered",
    canceled: "Canceled",
    cancelled: "Canceled"
  };
  return map[t] || (s || "Unknown");
};

// stati finali (storico)
const FINAL = new Set(["consegnato","ritirato","annullato","delivered","withdrawn","canceled","cancelled"]);

// ========= normalizza /meals -> mappa { id -> {nome, prezzo} } =========
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
    if (typeof prezzo === "string") prezzo = Number(prezzo);
    map.set(key, { nome, prezzo: Number.isFinite(prezzo) ? Number(prezzo) : 0 });
  }
  return map;
}

// ========= helpers robusti per items/id/qty =========
const getQty = it => Number(it?.qty ?? it?.quantity ?? it?.quantita ?? it?.q ?? 1) || 1;
const getItemId = it => it?.mealId ?? it?.idmeal ?? it?.idmeals ?? it?.idMeal ?? it?.id ?? it?._id;
const getItemNameFromSnapshot = it => (it?.name ?? it?.nome ?? it?.strMeal) || "";

// estrae array di id dai vari formati di `meals`
function extractIdsFromMeals(meals) {
  if (!Array.isArray(meals)) return [];
  return meals.map(m => (typeof m === "object" && m !== null) ? getItemId(m) : m);
}

// ========= alias prezzi (unit e linea) + totale ordine =========
function firstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

// migliore prezzo unitario per un item
function getUnitPrice(it, cat) {
  // alias comuni
  const fromItem = firstNumber(
    it?.prezzo, it?.price, it?.unitPrice, it?.prezzoUnitario,
    it?.costo, it?.cost, it?.amount, it?.importo, it?.unit_amount
  );
  if (Number.isFinite(fromItem) && fromItem > 0) return fromItem;

  // se esiste totale riga → unit = totale/qty
  const qty = getQty(it);
  const line = getLineTotal(it);
  if (qty > 0 && Number.isFinite(line) && line > 0) return line / qty;

  // fallback catalogo
  const fromCatalog = Number(cat?.prezzo);
  if (Number.isFinite(fromCatalog) && fromCatalog > 0) return fromCatalog;

  return 0;
}

// totale riga su item
function getLineTotal(it) {
  return firstNumber(
    it?.lineTotal, it?.line_total, it?.total, it?.totale,
    it?.subtotal, it?.importoTotale, it?.amount_total
  );
}

// totale “fotografato” sull’ordine (se presente)
function getOrderSnapshotTotal(ord) {
  return firstNumber(
    ord?.total, ord?.totale, ord?.grandTotal, ord?.amount_total,
    ord?.subtotal, ord?.importoTotale
  );
}

// ========= rende l’elenco piatti + totale (robusto) =========
function renderItemsAndTotal(order, mealsMap) {
  let total = 0;
  let rows = [];
  const mealsIdsByIndex = extractIdsFromMeals(order.meals);

  const pushRow = (name, qty, unit, lineMaybe) => {
    const line = Number.isFinite(lineMaybe) && lineMaybe > 0 ? lineMaybe : unit * qty;
    total += line;
    rows.push(
      `<li>${name} &times;${qty} — <span class="muted">unit</span> ${money(unit)} <strong>→ ${money(line)}</strong></li>`
    );
  };

  if (Array.isArray(order.items) && order.items.length) {
    rows = order.items.map((it, idx) => {
      const id  = getItemId(it) ?? mealsIdsByIndex[idx];
      const cat = id != null ? mealsMap.get(String(id)) : null;

      let name = getItemNameFromSnapshot(it);
      const noName = !name || ["senza nome","unnamed","dish","piatto"].includes(String(name).trim().toLowerCase());
      if (noName) name = cat?.nome || (id != null ? `Dish #${id}` : "Dish");

      const qty   = getQty(it);
      const unit  = getUnitPrice(it, cat);
      const lineT = getLineTotal(it);

      pushRow(name, qty, unit, lineT);
      return ""; // è ignorato: rows viene popolato da pushRow
    });
  } else if (Array.isArray(order.meals) && order.meals.length) {
    order.meals.forEach(m => {
      const id  = (typeof m === "object") ? getItemId(m) : m;
      const qty = (typeof m === "object") ? getQty(m) : 1;
      const cat = id != null ? mealsMap.get(String(id)) : null;

      const name  = cat?.nome || (id != null ? `Dish #${id}` : "Dish");
      const unit  = getUnitPrice(m, cat);
      const lineT = getLineTotal(m);

      pushRow(name, qty, unit, lineT);
    });
  } else {
    // nessun dettaglio: prova col totale fotografato
    const snap = getOrderSnapshotTotal(order);
    if (Number.isFinite(snap) && snap > 0) {
      total = snap;
      rows = [`<li class="muted">(order total provided by backend)</li>`];
    } else {
      return { html: "<ul class=\"dishes\"><li class=\"muted\">—</li></ul>", total: Number(order.total) || 0 };
    }
  }

  // se l’ordine ha un totale fotografato > 0, prevale sul ricalcolo
  const snap = getOrderSnapshotTotal(order);
  if (Number.isFinite(snap) && snap > 0) total = snap;

  return { html: `<ul class="dishes">${rows.join("")}</ul>`, total };
}

// ========= bootstrap pagina =========
window.onload = async () => {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || user.role !== "cliente") {
    alert("Access reserved for customers");
    window.location.href = "login.html";
    return;
  }

  const attiviList  = document.getElementById("attivi-list");
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

    const attivi  = safeOrders.filter(o => !FINAL.has(normState(o)));
    const passati = safeOrders.filter(o =>  FINAL.has(normState(o)));

    const render = (ordini, container) => {
      if (!ordini.length) {
        container.innerHTML = "<li>-- No orders --</li>";
        return;
      }
      ordini.sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));

      container.innerHTML = ordini.map(o => {
        const stato   = normState(o);
        const { html, total } = renderItemsAndTotal(o, mealsMap);

        const created = o.createdAt ? when(o.createdAt) : "n/a";
        const closedAt = o.closedAt || o.deliveredAt || o.ritiratoAt || o.consegnatoAt;
        const closed  = closedAt ? when(closedAt) : "—";
        const delivery = "Pickup at restaurant";

        // totale ordine: snapshot se presente, altrimenti calcolato
        const orderTotal = Number(getOrderSnapshotTotal(o)) || total;

        return `
          <li>
            <strong>ID:</strong> ${normId(o)}<br>
            Created: ${created}${FINAL.has(stato) ? ` · Closed: ${closed}` : ""}<br>
            Status: ${labelStatus(stato)}<br>
            Dishes: ${html}
            Total: <strong>${money(orderTotal)}</strong><br>
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
