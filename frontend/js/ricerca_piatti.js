// ricerca_piatti.js — versione allineata a main.js (immagini + descrizione)

// ========================= base URL per API =========================
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

/* ===================== helpers immagini come in main.js ===================== */

// valida una stringa come URL immagine accettabile
function isValidImgPath(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t || t === "-" || t === "#") return false;
  // http(s)://...  oppure  //cdn...  oppure  /uploads/...
  return /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/");
}

// trova il primo campo immagine davvero valido tra vari alias (priorità strMealThumb)
function firstImage(p) {
  const src = p || {};
  const raw = src._raw || src.raw || {};

  const candidates = [
    // normalizzato
    src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
    // originale (raw)
    raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img
  ];

  for (let c of candidates) {
    if (!isValidImgPath(c)) continue;
    c = String(c).trim();
    if (c.startsWith("//")) return "https:" + c; // protocol-relative -> forza https
    return c;
  }
  return "";
}

// seleziona URL immagine con fallback (come in main.js: placehold.co)
function pickImageURL(p) {
  const cand = firstImage(p);
  if (isValidImgPath(cand)) {
    if (cand.startsWith("/")) return `${location.origin}${cand}`; // relativo -> assoluto
    return cand; // http/https
  }
  const label = encodeURIComponent((p.nome || "Food").split(" ")[0]);
  return `https://placehold.co/90x90?text=${label}`;
}

/* ===================== normalizzazione dati ===================== */

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
  // id
  let id = m.idmeals ?? m.idMeal ?? m.id;
  if (!id && typeof m._id === "string") id = m._id;

  // nome/categoria
  const nome      = m.nome ?? m.strMeal ?? m.name ?? "No name";
  const tipologia = m.tipologia ?? m.strCategory ?? m.category ?? "";

  // prezzo (se presente)
  const prezzoRaw = m.prezzo ?? m.price ?? m.cost ?? null;
  const prezzo    = (prezzoRaw !== null && !isNaN(Number(prezzoRaw))) ? Number(prezzoRaw) : undefined;

  // descrizione (priorità strInstructions)
  const descrizione = m.descrizione ?? m.description ?? m.desc ?? m.details ?? m.strInstructions ?? "";

  // ingredienti (array oppure TheMealDB strIngredient1..20)
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

  const immagine    = firstImage({ ...m, _raw: m });
  const restaurantId= m.restaurantId ?? restaurantIdFallback ?? null;

  return { _raw: m, id, nome, tipologia, prezzo, descrizione, ingredienti, immagine, restaurantId };
}

const money = n => `€${Number(n || 0).toFixed(2)}`;
function includesCI(hay, needle) {
  if (!needle) return true;
  if (!hay) return false;
  return String(hay).toLowerCase().includes(String(needle).toLowerCase());
}

/* ===================== rendering ===================== */

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
    const res = await fetch(`${API_BASE}/meals`, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();

    // array ristoranti con menu annidato
    const ristoranti = (Array.isArray(data) ? data : []).map(normalizeRestaurant);

    // piatti flatten con info ristorante
    const allMeals = [];
    for (const r of ristoranti) {
      for (const m of r.menu) {
        allMeals.push({ piatto: normalizeMeal(m, r.id), risto: r });
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
  // facoltativo: prima ricerca automatica
  // window.cercaPiatti();
});
