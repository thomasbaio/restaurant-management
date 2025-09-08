// ricerca_piatti.js

// ================= base URL per API: locale vs produzione =================
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

/* ===================== helpers ===================== */

// URL immagine valido (http/https, //cdn, oppure /percorso/relativo)
function isValidImgPath(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t || t === "-" || t === "#") return false;
  return /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/");
}

// piccola icona segnaposto inline (SVG) se l’immagine manca o fallisce
const FALLBACK_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90">
       <rect width="100%" height="100%" fill="#EEE"/>
       <text x="50%" y="50%" font-size="12" text-anchor="middle" fill="#777" dy=".3em">no image</text>
     </svg>`
  );

const money = n => `€${Number(n || 0).toFixed(2)}`;

function includesCI(hay, needle) {
  if (!needle) return true;
  if (!hay) return false;
  return String(hay).toLowerCase().includes(String(needle).toLowerCase());
}

/* ===================== extraction helpers (TheMealDB-like) ===================== */

// Estrae la prima immagine “buona” dando priorità a strMealThumb
function getFirstImage(obj) {
  const m = obj ?? {};
  const raw = m._raw ?? m;

  const candidates = [
    m.strMealThumb, raw.strMealThumb, // PRIORITÀ
    m.foto, m.image, m.img, m.photo, m.picture, m.thumb,
    raw.foto, raw.image, raw.img, raw.photo, raw.picture, raw.thumb,
    ...(Array.isArray(m.images) ? m.images : []),
    ...(Array.isArray(raw.images) ? raw.images : []),
  ].filter(Boolean);

  for (const c of candidates) {
    if (typeof c === "string" && isValidImgPath(c)) return c;
  }
  // prova a “normalizzare” un path relativo (es. images/pasta.jpg)
  for (const c of candidates) {
    if (typeof c === "string") {
      const t = c.trim();
      if (t && !t.startsWith("http") && !t.startsWith("//")) {
        return t.startsWith("/") ? t : `/${t}`;
      }
    }
  }
  return ""; // nessuna valida
}

// Costruisce array ingredienti da:
// - array già presenti (ingredienti/ingredients)
// - campi numerati TheMealDB: strIngredient1..20 (+ strMeasure1..20)
function extractIngredientsFlexible(m) {
  if (Array.isArray(m.ingredienti) && m.ingredienti.length) return m.ingredienti.filter(Boolean);
  if (Array.isArray(m.ingredients) && m.ingredients.length) return m.ingredients.filter(Boolean);

  const list = [];
  for (let i = 1; i <= 20; i++) {
    const ing = m[`strIngredient${i}`];
    const qty = m[`strMeasure${i}`];
    if (ing && String(ing).trim()) {
      const txt = qty && String(qty).trim() ? `${ing} (${qty})` : String(ing);
      list.push(txt);
    }
  }
  return list;
}

/* ===================== normalizzazioni ===================== */

function normalizeMeal(m) {
  const nome        = m.nome ?? m.strMeal ?? m.name ?? "";
  const tipologia   = m.tipologia ?? m.strCategory ?? m.category ?? "";
  const prezzoRaw   = m.prezzo ?? m.price ?? m.cost ?? null;
  const prezzo      = prezzoRaw === null ? null : Number(prezzoRaw);

  // immagine: priorità a strMealThumb
  const foto        = getFirstImage({ ...m, _raw: m });

  // descrizione: prova diversi alias, priorità a strInstructions (TheMealDB)
  const descrizione =
    m.descrizione ?? m.description ?? m.desc ?? m.details ?? m.strInstructions ?? "";

  // ingredienti da array o da campi numerati
  const ingredienti = extractIngredientsFlexible(m);

  const id = m.idmeals ?? m.id ?? m._id ?? null;

  return { id, nome, tipologia, prezzo, foto, ingredienti, descrizione, _raw: m };
}

function normalizeRestaurant(r) {
  const id        = r.restaurantId ?? r.id ?? r._id ?? r.ownerUserId ?? null;
  const nome      = r.nomeRistorante ?? r.nome ?? r.name ?? r.restaurantName ?? "";
  const luogo     = r.luogo ?? r.citta ?? r.location ?? r.city ?? "";
  const indirizzo = r.indirizzo ?? r.address ?? "";
  const telefono  = r.telefono ?? r.phone ?? r.phoneNumber ?? "";
  const menu      = Array.isArray(r.menu) ? r.menu : [];
  return { id, nome, luogo, indirizzo, telefono, menu, _raw: r };
}

/* ===================== rendering ===================== */

function mealCardHTML(piatto, risto) {
  const priceHTML = Number.isFinite(piatto.prezzo)
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
  const ristoHTML = `
    <div style="margin-top:6px;">
      <div><strong>Restaurant:</strong> ${risto.nome || "—"}</div>
      ${ristoPosizione ? `<div><strong>Location:</strong> ${ristoPosizione}</div>` : ""}
      ${risto.telefono ? `<div><strong>Phone:</strong> ${risto.telefono}</div>` : ""}
    </div>
  `;

  const imgSrc = (piatto.foto && piatto.foto.trim()) ? piatto.foto : FALLBACK_IMG;

  return `
    <div style="display:flex; gap:12px; align-items:flex-start; border:1px solid #e5e5e5; border-radius:10px; padding:10px;">
      <img src="${imgSrc}" alt="${piatto.nome}"
           style="width:90px;height:90px;object-fit:cover;border-radius:8px;"
           onerror="this.onerror=null; this.src='${FALLBACK_IMG}';">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700;">${piatto.nome || "No name"}</div>
        ${tipoHTML}
        ${priceHTML}
        ${ingHTML}
        ${descHTML}
        ${ristoHTML}
      </div>
    </div>
  `;
}

/* ===================== main search ===================== */

window.cercaPiatti = async function cercaPiatti() {
  const ul = document.getElementById("risultati-piatti");
  if (!ul) return;
  ul.innerHTML = "<li>Searching...</li>";

  const qNome         = (document.getElementById("nome")      ?.value || "").trim();
  const qTipo         = (document.getElementById("tipologia") ?.value || "").trim();
  const qPrezzoMaxStr = (document.getElementById("prezzo")    ?.value || "").trim();
  const qPrezzoMax    = qPrezzoMaxStr ? Number(qPrezzoMaxStr) : null;

  try {
    const res = await fetch(`${API_BASE}/meals`, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();

    const ristoranti = (Array.isArray(data) ? data : []).map(normalizeRestaurant);

    const allMeals = [];
    for (const r of ristoranti) {
      for (const m of r.menu) {
        const p = normalizeMeal(m);
        allMeals.push({ risto: r, piatto: p });
      }
    }

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

/* ===================== UX extra ===================== */
document.addEventListener("DOMContentLoaded", () => {
  const inputs = ["nome", "tipologia", "prezzo"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  for (const el of inputs) {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") window.cercaPiatti();
    });
  }
  // esegui subito la prima ricerca se vuoi:
  // window.cercaPiatti();
});
