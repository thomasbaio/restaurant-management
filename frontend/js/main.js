// main.js — versione "ORDER" (senza cart)

// ========================= base URL per API =========================
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

// ====== Config pagina ordine (modifica se usi un nome diverso) ======
const ORDER_PAGE = "order.html";

// ===================== helpers di normalizzazione =====================

// estrai array ingredienti
function extractIngredients(p) {
  return Array.isArray(p.ingredients) ? p.ingredients.filter(Boolean) : [];
}

// valida una stringa come URL immagine accettabile (http/https o path relativo /...)
function isValidImgPath(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t || t === "-" || t === "#") return false;
  // http(s)://...  oppure  //cdn...  oppure  /uploads/...
  return /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/");
}

// trova il primo campo immagine davvero valido tra vari alias
function firstImage(p) {
  const src = p || {};
  const raw = src.raw || {};

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

// selezione URL immagine con fallback/placeholder
function pickImageURL(p) {
  const cand = firstImage(p);
  if (isValidImgPath(cand)) {
    if (cand.startsWith("/")) return `${location.origin}${cand}`; // path relativo -> assoluto
    return cand; // http/https
  }
  const label = encodeURIComponent((p.nome || "Food").split(" ")[0]);
  return `https://placehold.co/80x60?text=${label}`;
}

// normalizza un piatto a un formato coerente per il rendering
function normalizeMeal(p, restaurantIdFallback) {
  // id (supporta idmeals, idMeal, id, _id)
  let id = p.idmeals ?? p.idMeal ?? p.id;
  if (!id && typeof p._id === "string") id = p._id;

  // nome
  const nome = p.nome ?? p.strMeal ?? p.name ?? "Senza nome";

  // tipologia/categoria
  const tipologia = p.tipologia ?? p.strCategory ?? p.category ?? "";

  // prezzo
  let prezzo = p.prezzo ?? p.price;
  prezzo = (prezzo !== undefined && prezzo !== null && !isNaN(Number(prezzo))) ? Number(prezzo) : undefined;

  // immagine
  const immagine = firstImage(p);

  // restaurantId
  const restaurantId = p.restaurantId ?? restaurantIdFallback ?? null;

  return {
    raw: p,
    idmeals: p.idmeals ?? null,
    id,
    nome,
    tipologia,
    prezzo,
    immagine,
    ingredients: extractIngredients(p),
    restaurantId
  };
}

// rende sicuro il toFixed
function formatPrice(n) {
  return (typeof n === "number" && isFinite(n)) ? n.toFixed(2) : "n.d.";
}

/* =================== fallback foto da file (meals1.json) =================== */

// normalizzazione chiave "nome|categoria" senza accenti/maiuscole/spazi multipli
function normalizeKey(nome, cat) {
  const strip = (s) => String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // rimuove diacritici
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  return `${strip(nome)}|${strip(cat)}`;
}

// costruisce una mappa da piatti del FILE: key -> url immagine
async function buildFileImageMap() {
  try {
    const res = await fetch(`${API_BASE}/meals/common-meals?source=file`);
    if (!res.ok) throw new Error(`GET /meals/common-meals?source=file ${res.status}`);
    const list = await res.json();
    const map = new Map();
    for (const m of Array.isArray(list) ? list : []) {
      const url = firstImage(m);
      if (!isValidImgPath(url)) continue;
      const nome = m.nome ?? m.strMeal ?? m.name ?? "";
      const cat  = m.tipologia ?? m.strCategory ?? m.category ?? "";
      const key = normalizeKey(nome, cat);
      if (!map.has(key)) map.set(key, url);
    }
    return map;
  } catch (e) {
    console.warn("Impossibile costruire la mappa immagini dal file:", e.message);
    return new Map();
  }
}

// se il piatto non ha immagine, prova a prenderla dalla mappa del file
function applyImageFallbackFromMap(meal, imgMap) {
  if (!meal) return meal;
  if (isValidImgPath(meal.immagine) || isValidImgPath(firstImage(meal))) return meal;
  const key = normalizeKey(meal.nome, meal.tipologia);
  const url = imgMap.get(key);
  if (isValidImgPath(url)) meal.immagine = url;
  return meal;
}

/* =================== flusso ordine singolo (no cart) =================== */

function goToOrder(meal) {
  let user = null;
  try { user = JSON.parse(localStorage.getItem("loggedUser") || "null"); } catch {}
  if (!user || user.role !== "cliente") {
    alert("Accedi come cliente per effettuare un ordine.");
    location.href = "login.html";
    return;
  }
  if (!meal || !meal.id) {
    alert("Non è stato possibile iniziare l'ordine per questo piatto.");
    return;
  }

  const params = new URLSearchParams({
    dishId: String(meal.id),
    restaurantId: meal.restaurantId ? String(meal.restaurantId) : "",
  });
  location.href = `${ORDER_PAGE}?${params.toString()}`;
}

/* =========================== ui helpers =========================== */

function getQueryParam(name) {
  const params = new URLSearchParams(location.search);
  const v = params.get(name);
  return (v || "").trim();
}

function setSelectedCategoryLabel(cat) {
  const el = document.getElementById("selected-category");
  if (!el) return;
  const label = (cat && cat !== "*") ? cat : "All categories";
  el.textContent = label;
}

// preferenza profilo (usata per Offerte speciali)
function getUserPreferredCategory(u) {
  return (u?.preferenza ?? u?.preferredCategory ?? u?.favoriteCategory ?? "")
    .toString()
    .trim();
}

/* ===================== Client exclusivity helpers ===================== */

function setDisabled(el, disabled) {
  if (!el) return;
  el.disabled = !!disabled;
  el.querySelectorAll("input, select, textarea, button").forEach(c => c.disabled = !!disabled);
}

function enforceClientExclusivity(isCustomer) {
  // Blocchi marcati data-client-only
  document.querySelectorAll("[data-client-only]").forEach(block => {
    if (isCustomer) {
      block.hidden = false;
      setDisabled(block, false);
    } else {
      block.hidden = true;
      setDisabled(block, true);
    }
  });

  // search dish (filtro ingredienti)
  const ingInput = document.getElementById("filter-ingredient");
  if (ingInput) {
    if (isCustomer) {
      ingInput.disabled = false;
      if (!ingInput.placeholder) ingInput.placeholder = "Filter by ingredient…";
    } else {
      ingInput.value = "";
      ingInput.disabled = true;
      ingInput.placeholder = "Login as customer to use search";
    }
  }

  // search restaurant
  const restForm   = document.getElementById("search-restaurants-form");
  const btnSearch  = document.getElementById("btn-cerca-ristoranti");
  const nomeInput  = document.getElementById("nome");
  const luogoInput = document.getElementById("luogo");

  if (isCustomer) {
    setDisabled(restForm, false);
    setDisabled(btnSearch, false);
    if (nomeInput)  nomeInput.disabled  = false;
    if (luogoInput) luogoInput.disabled = false;
  } else {
    setDisabled(restForm, true);
    setDisabled(btnSearch, true);
    if (nomeInput)  { nomeInput.value = "";  nomeInput.disabled  = true; }
    if (luogoInput) { luogoInput.value = ""; luogoInput.disabled = true; }
  }
}

/* =========================== renderers =========================== */

// tabella classica (se presente)
function renderTable(meals, isRestaurateur) {
  const tbody = document.getElementById("menu-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!meals || !meals.length) {
    tbody.innerHTML = '<tr><td colspan="6">No dishes found</td></tr>';
    return;
  }

  meals.forEach(meal => {
    const tr = document.createElement("tr");
    const ings = Array.isArray(meal.ingredients) ? meal.ingredients.filter(Boolean) : [];

    const imgURL = pickImageURL(meal);
    const imgHTML = imgURL ? `<img src="${imgURL}" width="80" height="60" alt="Photo">` : "-";

    // delete abilitato solo a ristoratore con id valido
    const hasIdMeals = meal.idmeals != null && meal.idmeals !== "";
    const oidRaw = meal.raw && typeof meal.raw._id === "string" ? meal.raw._id : "";
    const theOidIsValid = /^[0-9a-fA-F]{24}$/.test(oidRaw);
    const canDelete = isRestaurateur && (hasIdMeals || theOidIsValid);

    const deleteHTML = canDelete
      ? `<button class="btn-delete"
                  data-idmeals="${hasIdMeals ? String(meal.idmeals) : ""}"
                  data-oid="${theOidIsValid ? oidRaw : ""}"
                  data-rid="${meal.restaurantId || ""}">Delete</button>`
      : "";

    tr.innerHTML = `
      <td>${meal.nome}</td>
      <td>€ ${formatPrice(meal.prezzo)}</td>
      <td>${meal.tipologia || "-"}</td>
      <td>${ings.length ? ings.join(", ") : "-"}</td>
      <td>${imgHTML}</td>
      <td>
        <button class="btn-order" data-id="${meal.id}">Order</button>
        ${deleteHTML}
      </td>
    `;

    // attach pulsante Order
    const orderBtn = tr.querySelector(".btn-order");
    orderBtn.addEventListener("click", () => goToOrder(meal));

    if (canDelete) {
      const btn = tr.querySelector(".btn-delete");
      btn.addEventListener("click", () => removeMeal(btn.dataset.idmeals, btn.dataset.oid, btn.dataset.rid));
    }

    tbody.appendChild(tr);
  });
}

// elimina piatto (ristoratore)
async function removeMeal(idMeals, oid, rid) {
  let user = null;
  try { user = JSON.parse(localStorage.getItem("loggedUser")); } catch {}
  if (!user || !user.restaurantId) return;

  if (!confirm("Do you really want to delete this dish?")) return;

  const restaurantId = rid || user.restaurantId;

  const hasMealsId = idMeals != null && idMeals !== "";
  const hasOid = typeof oid === "string" && /^[0-9a-fA-F]{24}$/.test(oid);

  const attempts = [];
  if (hasMealsId) {
    attempts.push(`${API_BASE}/meals/${encodeURIComponent(idMeals)}`);
    attempts.push(`${API_BASE}/meals/${encodeURIComponent(restaurantId)}/${encodeURIComponent(idMeals)}`);
  }
  if (hasOid) {
    attempts.push(`${API_BASE}/meals/${encodeURIComponent(oid)}`);
    attempts.push(`${API_BASE}/meals/${encodeURIComponent(restaurantId)}/${encodeURIComponent(oid)}`);
  }

  if (!attempts.length) {
    alert("Unable to delete: missing or invalid ID.");
    return;
  }

  const tryDelete = async (url) => {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`DELETE failed ${res.status} – ${body}`);
    }
  };

  for (const url of attempts) {
    try {
      await tryDelete(url);
      window.location.reload();
      return;
    } catch (e) {
      console.warn("Tentativo fallito:", e.message);
    }
  }

  alert("Error removing dish");
}

// rendering “menù per ristorante” (card) con filtro categoria
function renderMenusGroupedSection(meals, rawAllData, activeCategory) {
  const root = document.getElementById("menu-by-restaurant");
  if (!root) return;

  // se c'è una categoria attiva, filtra prima
  const cat = (activeCategory || "").trim().toLowerCase();
  const mealsFiltered = cat && cat !== "*"
    ? (meals || []).filter(p => (p.tipologia || "").toLowerCase() === cat)
    : (meals || []);

  // costruisco mappa restaurantId -> { name, items[] }
  const groups = new Map();

  // prova a ricavare i nomi ristorante da /meals (annidato)
  if (Array.isArray(rawAllData) && rawAllData.some(r => Array.isArray(r.menu))) {
    for (const r of rawAllData) {
      const rid = String(r.restaurantId ?? r.id ?? r._id ?? "");
      const name = r.nome ?? r.name ?? r.restaurantName ?? (rid ? `Ristorante ${rid}` : "Ristorante");
      if (!groups.has(rid)) groups.set(rid, { name, items: [] });
    }
  }

  for (const p of mealsFiltered) {
    const rid = String(p.restaurantId ?? "");
    if (!groups.has(rid)) {
      groups.set(rid, { name: rid ? `Ristorante ${rid}` : "Ristorante", items: [] });
    }
    groups.get(rid).items.push(p);
  }

  // prova ad arricchire i nomi con /users/restaurants (best-effort)
  const enrichNames = async () => {
    const needsLookup = [...groups.values()].some(g => !g.name || /^Ristorante\s/.test(g.name));
    if (!needsLookup) return;
    try {
      const ures = await fetch(`${API_BASE}/users/restaurants`, { mode: "cors" });
      if (!ures.ok) return;
      const rUsers = await ures.json();
      const byId = new Map((Array.isArray(rUsers) ? rUsers : []).map(u => [String(u.restaurantId ?? u.id ?? u._id ?? ""), u]));
      for (const [rid, g] of groups.entries()) {
        const u = byId.get(rid);
        if (u) g.name = u.nome ?? u.name ?? g.name;
      }
    } catch {}
  };

  const draw = () => {
    root.innerHTML = "";
    const entries = [...groups.entries()].filter(([, g]) => (g.items || []).length > 0);

    if (!entries.length) {
      root.innerHTML = `<p>No restaurants available${cat && cat !== "*" ? ` for category "${activeCategory}"` : ""}.</p>`;
      return;
    }

    entries.sort((a, b) => a[1].name.localeCompare(b[1].name));

    for (const [, g] of entries) {
      const section = document.createElement("section");
      section.className = "ristorante-section";

      const header = document.createElement("h2");
      header.className = "ristorante-title";
      header.textContent = g.name;
      section.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "menu-grid";

      for (const meal of g.items) {
        const card = document.createElement("article");
        card.className = "piatto-card";

        const img = document.createElement("img");
        img.className = "piatto-img";
        img.alt = meal.nome;
        img.loading = "lazy";
        img.src = pickImageURL(meal);
        card.appendChild(img);

        const h3 = document.createElement("h3");
        h3.className = "piatto-title";
        h3.textContent = meal.nome;
        card.appendChild(h3);

        if (meal.tipologia) {
          const badge = document.createElement("div");
          badge.className = "badge";
          badge.textContent = meal.tipologia;
          card.appendChild(badge);
        }

        if (Array.isArray(meal.ingredients) && meal.ingredients.length) {
          const ing = document.createElement("p");
          ing.className = "piatto-ingredients";
          ing.textContent = "Ingredients: " + meal.ingredients.join(", ");
          card.appendChild(ing);
        }

        const price = document.createElement("div");
        price.className = "piatto-price";
        price.textContent = `€ ${formatPrice(meal.prezzo)}`;
        card.appendChild(price);

        const user = JSON.parse(localStorage.getItem("loggedUser") || "null");
        if (user?.role === "cliente") {
          const btn = document.createElement("button");
          btn.className = "btn-order";
          btn.textContent = "Order";
          btn.addEventListener("click", () => goToOrder(meal));
          card.appendChild(btn);
        }

        grid.appendChild(card);
      }

      section.appendChild(grid);
      root.appendChild(section);
    }
  };

  draw();
  enrichNames().then(draw).catch(() => {});
}

/* ========================= Personalized offers helpers ========================= */

// ——— Ricava una mappa { restaurantId -> nomeRistorante } dai ristoratori
async function fetchRestaurantsNameMap() {
  try {
    const res = await fetch(`${API_BASE}/users/restaurants`, { mode: "cors" });
    if (!res.ok) return new Map();
    const arr = await res.json();
    return new Map(
      (Array.isArray(arr) ? arr : []).map(u => {
        const id = String(u.restaurantId ?? u.id ?? u._id ?? "");
        const name = u.nome ?? u.name ?? (id ? `Ristorante ${id}` : "Ristorante");
        return [id, name];
      })
    );
  } catch {
    return new Map();
  }
}

// ——— Raggruppa per restaurantId una lista di piatti
function groupMealsByRestaurant(meals) {
  const groups = new Map();
  for (const m of (Array.isArray(meals) ? meals : [])) {
    const rid = String(m.restaurantId ?? "");
    if (!groups.has(rid)) groups.set(rid, []);
    groups.get(rid).push(m);
  }
  return groups;
}

// ——— Render “Personalized offers” raggruppate per ristorante
async function renderPersonalizedOffersGrouped(user, allMeals) {
  const container = document.getElementById("special-offers");
  if (!container) return;

  const pref = (user?.preferenza ?? user?.preferredCategory ?? "").toString().trim();
  if (!pref) {
    container.innerHTML = `
      <li>No preference set. <a href="edituser.html">Set your preferred category</a> to receive personalized offers.</li>
    `;
    return;
  }

  // Filtra SOLO per preferenza (le offerte non dipendono dalla select categoria dei menu)
  const matches = (Array.isArray(allMeals) ? allMeals : [])
    .filter(p => (p.tipologia || "").toLowerCase() === pref.toLowerCase());

  if (!matches.length) {
    container.innerHTML = `<li>No dishes found for your preference "<strong>${pref}</strong>".</li>`;
    return;
  }

  // Mappa nomi ristoranti
  const nameMap = await fetchRestaurantsNameMap();
  const groups   = groupMealsByRestaurant(matches);

  const sections = [];
  for (const [rid, items] of groups.entries()) {
    if (!items.length) continue;
    const rName = nameMap.get(rid) || (rid ? `Ristorante ${rid}` : "Ristorante");

    const itemsHTML = items.map(p => `
      <li style="display:flex;align-items:center;gap:10px;margin:8px 0;">
        <img src="${pickImageURL(p)}" alt="Photo" width="80" height="60">
        <div style="flex:1 1 auto;">
          <div><strong>${p.nome}</strong> ${p.tipologia ? `– <span class="muted">(${p.tipologia})</span>` : ""}</div>
          <div>€ ${formatPrice(p.prezzo)}</div>
          ${(JSON.parse(localStorage.getItem("loggedUser")||"null")?.role === "cliente")
            ? `<button class="btn-order" data-id="${p.id}">Order</button>`
            : ``}
        </div>
      </li>
    `).join("");

    sections.push(`
      <li class="box" style="list-style:none;">
        <h3 style="margin:0 0 8px 0;">${rName}</h3>
        <ul style="margin:0;padding-left:0;">${itemsHTML}</ul>
      </li>
    `);
  }

  container.innerHTML = sections.join("") || `<li>No restaurants available for "<strong>${pref}</strong>".</li>`;

  // Attach “Order”
  container.querySelectorAll("button.btn-order").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const m  = matches.find(x => String(x.id) === String(id));
      if (m) goToOrder(m);
    });
  });
}

/* ============================== boot ============================== */

window.onload = async () => {
  let user = null;
  try { user = JSON.parse(localStorage.getItem("loggedUser")); } catch {}

  const role = user?.role || null;
  const isCustomer = role === "cliente";
  const isRestaurateur = role === "ristoratore";

  // ⬇️ Rendi “search dish” e “search restaurant” esclusivi dei clienti
  enforceClientExclusivity(isCustomer);

  // Banner “browse only” per non clienti
  (function showBrowseOnlyBanner() {
    const noti = document.getElementById("noti");
    if (noti && (!user || user.role !== "cliente")) {
      noti.innerHTML = `
        <div class="box muted">
          Sei libero di sfogliare i menu. <strong>Accedi come cliente</strong> per effettuare un ordine.
          <a href="login.html">Vai al login</a>
        </div>
      `;
    }
  })();

  // mostra/nasconde sezione “offerte speciali” in base al ruolo
  (function toggleSpecialOffers() {
    const ul = document.getElementById("special-offers");
    if (!ul) return;
    const prev = ul.previousElementSibling;
    if (isCustomer) {
      ul.style.display = "";
      if (prev && prev.tagName === "H2") prev.style.display = "";
      if (!ul.innerHTML.trim()) ul.innerHTML = "<li>Loading...</li>";
    } else {
      ul.innerHTML = "";
      ul.style.display = "none";
      if (prev && prev.tagName === "H2") prev.style.display = "none";
    }
  })();

  // nascondi link “aggiungi” se non ristoratore (compatibilità)
  const linkAdd = document.getElementById("link-add");
  if (linkAdd && !isRestaurateur) linkAdd.style.display = "none";

  if (isRestaurateur && (!user.restaurantId || user.restaurantId === "")) {
    alert("Error: your restaurateur profile has no associated restaurantId.");
    return;
  }

  try {
    // carica menu + mappa immagini
    const [menuRes, imgMap] = await Promise.all([
      fetch(`${API_BASE}/meals`),
      buildFileImageMap(),
    ]);

    if (!menuRes.ok) {
      const body = await menuRes.text().catch(() => "");
      throw new Error(`GET /meals ${menuRes.status} – ${body}`);
    }
    const allData = await menuRes.json();

    const isNested = Array.isArray(allData) && allData.some(r => Array.isArray(r.menu));

    // tutti i piatti normalizzati (con restaurantId)
    const allMealsNormalized = isNested
      ? allData.flatMap(r => (r.menu || []).map(m => normalizeMeal(m, r.restaurantId)))
      : (Array.isArray(allData) ? allData.map(m => normalizeMeal(m)) : []);

    allMealsNormalized.forEach(m => applyImageFallbackFromMap(m, imgMap));

    // ———— costruzione lista categorie (per select) ————
    const categories = Array.from(new Set(
      allMealsNormalized.map(m => (m.tipologia || "").trim()).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));

    const catSelect = document.getElementById("category-filter");
    if (catSelect && !catSelect.dataset.populated) {
      // opzione "tutte"
      const optAll = document.createElement("option");
      optAll.value = "*";
      optAll.textContent = "All categories";
      catSelect.appendChild(optAll);
      // opzioni reali
      for (const c of categories) {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        catSelect.appendChild(o);
      }
      catSelect.dataset.populated = "1";
    }

    // ———— DECISIONE CATEGORIA ATTIVA ————
    // I menù NON devono usare la preferenza del cliente.
    // Priorità: 1) select #category-filter, 2) URL ?cat=, 3) "*"
    const urlCat = getQueryParam("cat");
    let activeCategory = "*"; // di default mostra tutto

    if (catSelect && catSelect.value && catSelect.value !== "*") {
      activeCategory = catSelect.value;
    } else if (urlCat) {
      activeCategory = urlCat;
      if (catSelect) catSelect.value = urlCat;
    }

    setSelectedCategoryLabel(activeCategory && activeCategory !== "*" ? activeCategory : "All categories");

    // ———— COSTRUISCI LISTA “da mostrare” (tabella) ————
    let mealsToShow;
    if (isRestaurateur) {
      if (isNested) {
        const ristorante = allData.find(r => String(r.restaurantId) === String(user.restaurantId));
        if (!ristorante) {
          alert(`Error: no menu found for your restaurantId (${user.restaurantId}).`);
          return;
        }
        mealsToShow = (ristorante.menu || []).map(m => normalizeMeal(m, ristorante.restaurantId));
      } else {
        const filtered = allMealsNormalized.filter(m => String(m.restaurantId) === String(user.restaurantId));
        mealsToShow = filtered.length ? filtered : allMealsNormalized;
      }
    } else {
      mealsToShow = allMealsNormalized;
    }
    mealsToShow.forEach(m => applyImageFallbackFromMap(m, imgMap));

    // salva global per filtro ingredienti
    window.__allMeals = mealsToShow;
    window.__allMealsAll = allMealsNormalized; // utile per offerte speciali

    // render tabella (se presente)
    renderTable(
      activeCategory && activeCategory !== "*"
        ? mealsToShow.filter(p => (p.tipologia || "").toLowerCase() === activeCategory.toLowerCase())
        : mealsToShow,
      isRestaurateur
    );

    // render vista per ristorante (card) con la categoria attiva
    renderMenusGroupedSection(mealsToShow, allData, activeCategory);

    // ———— Personalized offers (solo cliente), raggruppate per ristorante ————
    if (isCustomer) {
      await renderPersonalizedOffersGrouped(user, (window.__allMealsAll || []));
    } else {
      const offersContainer = document.getElementById("special-offers");
      if (offersContainer) {
        offersContainer.innerHTML = "";
        offersContainer.style.display = "none";
        const prev = offersContainer.previousElementSibling;
        if (prev && prev.tagName === "H2") prev.style.display = "none";
      }
    }

    // ———— eventi: cambio categoria dal select ————
    if (catSelect) {
      catSelect.addEventListener("change", () => {
        const newCat = catSelect.value || "*";
        setSelectedCategoryLabel(newCat && newCat !== "*" ? newCat : "All categories");

        // aggiorna tabella
        const mealsNow = (window.__allMeals || []);
        const filteredForTable = newCat && newCat !== "*"
          ? mealsNow.filter(p => (p.tipologia || "").toLowerCase() === newCat.toLowerCase())
          : mealsNow;
        renderTable(filteredForTable, isRestaurateur);

        // aggiorna vista per ristorante
        renderMenusGroupedSection(mealsNow, allData, newCat);

        // le offerte restano ancorate alla preferenza profilo
      });
    }

    // filtro ingredienti live (se presente) — esclusivo clienti già gestito da enforceClientExclusivity
    const filterInput = document.getElementById("filter-ingredient");
    if (filterInput) {
      filterInput.addEventListener("input", () => {
        if (filterInput.disabled) return; // se non cliente, non fa nulla
        const text = filterInput.value.trim().toLowerCase();
        const base = (window.__allMeals || []);
        const categoryNow = (catSelect && catSelect.value) ? catSelect.value : activeCategory;
        const baseByCat = categoryNow && categoryNow !== "*"
          ? base.filter(p => (p.tipologia || "").toLowerCase() === categoryNow.toLowerCase())
          : base;
        const filtered = baseByCat.filter(p =>
          (p.ingredients || []).some(i => String(i).toLowerCase().includes(text))
        );
        renderTable(filtered, isRestaurateur);
        renderMenusGroupedSection(filtered, allData, categoryNow);
      });
    }

  } catch (err) {
    console.error("Errore nel caricamento del menu:", err);
    alert("Error loading menu");
  }
};
