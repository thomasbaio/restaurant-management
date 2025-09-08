// ricerca_piatti.js
// ================= base URL per API: locale vs produzione =================
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

/* ===================== helpers ===================== */

// normalizza i campi PIATTO da sorgenti diverse
function normalizeMeal(m) {
  const nome        = m.nome ?? m.strMeal ?? m.name ?? "";
  const tipologia   = m.tipologia ?? m.strCategory ?? m.category ?? "";
  const prezzoRaw   = m.prezzo ?? m.price ?? m.cost ?? null;
  const prezzo      = prezzoRaw === null ? null : Number(prezzoRaw);
  const foto        = m.foto ?? m.strMealThumb ?? m.image ?? m.img ?? "";
  const ingredienti = Array.isArray(m.ingredienti) ? m.ingredienti
                    : Array.isArray(m.ingredients)  ? m.ingredients
                    : [];
  const descrizione = m.descrizione ?? m.description ?? "";

  // id (opzionale ma utile)
  const id = m.idmeals ?? m.id ?? m._id ?? null;

  return { id, nome, tipologia, prezzo, foto, ingredienti, descrizione, _raw: m };
}

// normalizza i campi RISTORANTE
function normalizeRestaurant(r) {
  const id            = r.restaurantId ?? r.id ?? r._id ?? r.ownerUserId ?? null;
  const nome          = r.nomeRistorante ?? r.nome ?? r.name ?? r.restaurantName ?? "";
  const luogo         = r.luogo ?? r.citta ?? r.location ?? r.city ?? "";
  const indirizzo     = r.indirizzo ?? r.address ?? "";
  const telefono      = r.telefono ?? r.phone ?? r.phoneNumber ?? "";
  const partitaIVA    = r.partitaIVA ?? r.vat ?? r.vatNumber ?? r.piva ?? "";
  const menu          = Array.isArray(r.menu) ? r.menu : [];

  return { id, nome, luogo, indirizzo, telefono, partitaIVA, menu, _raw: r };
}

// inclusione case-insensitive
function includesCI(hay, needle) {
  if (!needle) return true;
  if (!hay) return false;
  return String(hay).toLowerCase().includes(String(needle).toLowerCase());
}

// valida una stringa come URL immagine accettabile (http/https o path relativo /...)
function isValidImgPath(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t || t === "-" || t === "#") return false;
  return /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/");
}

const money = n => `€${Number(n || 0).toFixed(2)}`;

/* ===================== rendering ===================== */

function mealCardHTML(piatto, risto) {
  const hasImg = isValidImgPath(piatto.foto);
  const prezzoHTML = Number.isFinite(piatto.prezzo)
    ? `<div><strong>Price:</strong> ${money(piatto.prezzo)}</div>`
    : "";

  const tipoHTML = piatto.tipologia
    ? `<div><strong>Type:</strong> <em>${piatto.tipologia}</em></div>`
    : "";

  const ingHTML = (piatto.ingredienti && piatto.ingredienti.length)
    ? `<div><strong>Ingredients:</strong> ${piatto.ingredienti.join(", ")}</div>`
    : "";

  const descHTML = piatto.descrizione
    ? `<div class="muted" style="margin-top:4px;">${piatto.descrizione}</div>`
    : "";

  const ristoPosizione = [risto.indirizzo, risto.luogo].filter(Boolean).join(", ");
  const ristoInfoHTML = `
    <div style="margin-top:6px;">
      <div><strong>Restaurant:</strong> ${risto.nome || "—"}</div>
      ${ristoPosizione ? `<div><strong>Location:</strong> ${ristoPosizione}</div>` : ""}
      ${risto.telefono ? `<div><strong>Phone:</strong> ${risto.telefono}</div>` : ""}
    </div>
  `;

  return `
    <div style="display:flex; gap:12px; align-items:flex-start; border:1px solid #e5e5e5; border-radius:10px; padding:10px;">
      ${hasImg ? `<img src="${piatto.foto}" alt="${piatto.nome}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;">` : `
        <div style="width:90px;height:90px;display:grid;place-items:center;background:#f1f1f1;border-radius:8px;font-size:12px;color:#666;">no image</div>
      `}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700;">${piatto.nome || "No name"}</div>
        ${tipoHTML}
        ${prezzoHTML}
        ${ingHTML}
        ${descHTML}
        ${ristoInfoHTML}
      </div>
    </div>
  `;
}

/* ===================== main search ===================== */

// Espongo la funzione globalmente per l'onclick inline
window.cercaPiatti = async function cercaPiatti() {
  const ul = document.getElementById("risultati-piatti");
  if (!ul) return;
  ul.innerHTML = "<li>Searching...</li>";

  const qNome        = (document.getElementById("nome")      ?.value || "").trim();
  const qTipo        = (document.getElementById("tipologia") ?.value || "").trim();
  const qPrezzoMaxStr= (document.getElementById("prezzo")    ?.value || "").trim();
  const qPrezzoMax   = qPrezzoMaxStr ? Number(qPrezzoMaxStr) : null;

  try {
    const res = await fetch(`${API_BASE}/meals`, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();

    const ristoranti = (Array.isArray(data) ? data : []).map(normalizeRestaurant);

    // flat map dei piatti arricchendo con info ristorante
    const allMeals = [];
    for (const r of ristoranti) {
      for (const m of r.menu) {
        const p = normalizeMeal(m);
        allMeals.push({ risto: r, piatto: p });
      }
    }

    // filtri
    const filtered = allMeals.filter(({ piatto }) => {
      if (!includesCI(piatto.nome, qNome)) return false;
      if (!includesCI(piatto.tipologia, qTipo)) return false;
      if (qPrezzoMax !== null && Number.isFinite(piatto.prezzo) && piatto.prezzo > qPrezzoMax) return false;
      return true;
    });

    if (!filtered.length) {
      ul.innerHTML = "<li>No dishes found.</li>";
      return;
    }

    // render
    ul.innerHTML = "";
    for (const { piatto, risto } of filtered) {
      const li = document.createElement("li");
      li.style.marginBottom = "12px";
      li.innerHTML = mealCardHTML(piatto, risto);
      ul.appendChild(li);
    }
  } catch (err) {
    console.error("Dish search error:", err);
    ul.innerHTML = `<li style="color:#b00020;">Error during search. See console for details.</li>`;
  }
};

/* ===================== UX: invio con Enter e auto-search ===================== */
document.addEventListener("DOMContentLoaded", () => {
  const inputs = ["nome", "tipologia", "prezzo"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  for (const el of inputs) {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        window.cercaPiatti();
      }
    });
  }

  // opzionale: prima ricerca all’apertura pagina
  // window.cercaPiatti();
});
