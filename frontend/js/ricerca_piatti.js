// ricerca_piatti.js — immagini + descrizione con fallback dal file (come main.js)

// ========================= base URL per API =========================
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

/* ===================== helpers immagini (stessa logica di main.js) ===================== */

function isValidImgPath(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t || t === "-" || t === "#") return false;
  return /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/");
}

function firstImage(p) {
  const src = p || {};
  const raw = src._raw || src.raw || {};
  const candidates = [
    src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
    raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img
  ];
  for (let c of candidates) {
    if (!isValidImgPath(c)) continue;
    c = String(c).trim();
    if (c.startsWith("//")) return "https:" + c;
    return c;
  }
  return "";
}

function pickImageURL(p) {
  const cand = firstImage(p);
  if (isValidImgPath(cand)) {
    if (cand.startsWith("/")) return `${location.origin}${cand}`;
    return cand;
  }
  const label = encodeURIComponent((p.nome || "Food").split(" ")[0]);
  return `https://placehold.co/90x90?text=${label}`;
}

/* ===================== normalizzazione + chiavi mappa ===================== */

function normalizeRestaurant(r) {
  const id        = r.restaurantId ?? r.id ?? r._id ?? r.ownerUserId ?? null;
  const nome      = r.nomeRistorante ?? r.nome ?? r.name ?? r.restaurantName ?? "";
  const luogo     = r.luogo ?? r.citta ?? r.location ?? r.city ?? "";
  const indirizzo = r.indirizzo ?? r.address ?? "";
  const telefono  = r.telefono ?? r.phone ?? r.phoneNumber ?? "";
  const menu      = Array.isArray(r.menu) ? r.menu : [];
  return { id, nome, luogo, indirizzo, telefono, menu, _raw: r };
}

function normalizeMeal(m, restaurantIdFallback) {
  let id = m.idmeals ?? m.idMeal ?? m.id;
  if (!id && typeof m._id === "string") id = m._id;

  const nome      = m.nome ?? m.strMeal ?? m.name ?? "No name";
  const tipologia = m.tipologia ?? m.strCategory ?? m.category ?? "";

  const prezzoRaw = m.prezzo ?? m.price ?? m.cost ?? null;
  const prezzo    = (prezzoRaw !== null && !isNaN(Number(prezzoRaw))) ? Number(prezzoRaw) : undefined;

  const descrizione = m.descrizione ?? m.description ?? m.desc ?? m.details ?? m.strInstructions ?? "";

  let ingredienti = [];
  if (Array.isArray(m.ingredienti)) ingredienti = m.ingredienti.filter(Boolean);
  else if (Array.isArray(m.ingredients)) ingredienti = m.ingredients.filter(Boolean);
  else {
    const list = [];
    for (let i = 1; i <= 20; i++) {
      const ing = m[`strIngredient${i}`];
      const qty = m[`strMeasure${i}`];
      if (ing && String(ing).trim()) {
        list.push(qty ? `${String(ing).trim()} (${String(qty).trim()})` : String(ing).trim());
      }
    }
    ingredienti = list;
  }

  const immagine     = firstImage({ ...m, _raw: m });
  const restaurantId = m.restaurantId ?? restaurantIdFallback ?? null;

  return { _raw: m, id, nome, tipologia, prezzo, descrizione, ingredienti, immagine, restaurantId };
}

// chiave “nome|categoria” normalizzata (come in main.js)
function normalizeKey(nome, cat) {
  const strip = (s) => String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
  return `${strip(nome)}|${strip(cat)}`;
}

/* ============ mappa da file: nome+categoria -> {img, descrizione} ============ */

async function buildCommonMealMap() {
  try {
    const res = await fetch(`${API_BASE}/meals/common-meals?source=file`, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    const map = new Map();
    for (const m of Array.isArray(list) ? list : []) {
      const nome = m.nome ?? m.strMeal ?? m.name ?? "";
      const cat  = m.tipologia ?? m.strCategory ?? m.category ?? "";
      const key  = normalizeKey(nome, cat);
      const img  = firstImage(m);
      const desc = m.descrizione ?? m.description ?? m.desc ?? m.details ?? m.strInstructions ?? "";
      if (!map.has(key)) map.set(key, { img, desc });
    }
    return map;
  } catch (e) {
    console.warn("Common-meals map error:", e.message);
    return new Map();
  }
}

function applyFallbackFromMap(piatto, map) {
  if (!piatto) return piatto;
  const key = normalizeKey(piatto.nome, piatto.tipologia);
  const hit = map.get(key);
  if (!hit) return piatto;
  if (!isValidImgPath(piatto.immagine)) piatto.immagine = hit.img || piatto.immagine;
  if (!piatto.descrizione && hit.desc) piatto.descrizione = hit.desc;
  return piatto;
}

/* ===================== rendering ===================== */

const money = n => `€${Number(n || 0).toFixed(2)}`;
function includesCI(hay, needle) {
  if (!needle) return true;
  if (!hay) return false;
  return String(hay).toLowerCase().includes(String(needle).toLowerCase());
}

function mealCardHTML(piatto, risto) {
  const imgSrc = pickImageURL(piatto);

  const priceHTML = (typeof piatto.prezzo === "number" && isFinite(piatto.prezzo))
    ? `<div><strong>Price:</strong> ${money(piatto.prezzo)}</div>` : "";

  const tipoHTML  = piatto.tipologia ? `<div><strong>Type:</strong> <em>${piatto.tipologia}</em></div>` : "";

  const ingHTML   = (piatto.ingredienti && piatto.ingredienti.length)
    ? `<div><strong>Ingredients:</strong> ${piatto.ingredienti.join(", ")}</div>` : "";

  const descHTML  = piatto.descrizione
    ? `<div class="muted" style="margin-top:4px;">${piatto.descrizione}</div>` : "";

  const ristoPos  = [risto.indirizzo, risto.luogo].filter(Boolean).join(", ");
  const ristoHTML = `
    <div style="margin-top:6px;">
      <div><strong>Restaurant:</strong> ${risto.nome || "—"}</div>
      ${ristoPos ? `<div><strong>Location:</strong> ${ristoPos}</div>` : ""}
      ${risto.telefono ? `<div><strong>Phone:</strong> ${risto.telefono}</div>` : ""}
    </div>
  `;

  return `
    <div style="display:flex; gap:12px; align-items:flex-start; border:1px solid #e5e5e5; border-radius:10px; padding:10px;">
      <img src="${imgSrc}" alt="${piatto.nome}"
           style="width:90px;height:90px;object-fit:cover;border-radius:8px;"
           referrerpolicy="no-referrer" loading="lazy">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700;">${piatto.nome}</div>
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

  const qNome         = (document.getElementById("nome")?.value || "").trim();
  const qTipo         = (document.getElementById("tipologia")?.value || "").trim();
  const qPrezzoMaxStr = (document.getElementById("prezzo")?.value || "").trim();
  const qPrezzoMax    = qPrezzoMaxStr ? Number(qPrezzoMaxStr) : null;

  try {
    // carico sia /meals che la mappa dal file (per fallback)
    const [mealsRes, commonMap] = await Promise.all([
      fetch(`${API_BASE}/meals`, { mode: "cors" }),
      buildCommonMealMap(),
    ]);
    if (!mealsRes.ok) throw new Error(`HTTP ${mealsRes.status} ${mealsRes.statusText}`);
    const data = await mealsRes.json();

    const ristoranti = (Array.isArray(data) ? data : []).map(normalizeRestaurant);

    // flat + normalize + FALLBACK da mappa file per img/descrizione
    const allMeals = [];
    for (const r of ristoranti) {
      for (const m of r.menu) {
        const p = normalizeMeal(m, r.id);
        applyFallbackFromMap(p, commonMap);
        allMeals.push({ piatto: p, risto: r });
      }
    }

    // filtri
    const filtered = allMeals.filter(({ piatto }) => {
      if (!includesCI(piatto.nome, qNome)) return false;
      if (!includesCI(piatto.tipologia, qTipo)) return false;
      if (qPrezzoMax !== null && typeof piatto.prezzo === "number" && isFinite(piatto.prezzo) && piatto.prezzo > qPrezzoMax) return false;
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

/* ===================== UX extra ===================== */
document.addEventListener("DOMContentLoaded", () => {
  ["nome","tipologia","prezzo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("keydown", e => { if (e.key === "Enter") window.cercaPiatti(); });
  });
  // window.cercaPiatti();
});

