// base URL per API: locale vs produzione
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

// ---- helpers di normalizzazione ----

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
// funziona sia con l’oggetto normalizzato sia con quello originale (p.raw)
function firstImage(p) {
  const src = p || {};
  const raw = src.raw || {};

  const candidates = [
    // normalizzato
    src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
    // originale (raw) – ultima spiaggia
    raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img
  ];

  for (let c of candidates) {
    if (!isValidImgPath(c)) continue;
    c = String(c).trim();
    if (c.startsWith("//")) return "https:" + c;    // protocol-relative -> forziamo https
    return c;
  }
  return "";
}

// selezione URL immagine con fallback/placeholder
function pickImageURL(p) {
  const cand = firstImage(p);
  if (isValidImgPath(cand)) {
    if (cand.startsWith("/")) return `${location.origin}${cand}`; // path relativo -> assolutizzato
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

  // prezzo (se non numerico, lo segniamo come undefined)
  let prezzo = p.prezzo ?? p.price;
  prezzo = (prezzo !== undefined && prezzo !== null && !isNaN(Number(prezzo))) ? Number(prezzo) : undefined;

  // immagine: prendi SOLO una URL valida, ignorando "-", "" ecc.
  const immagine = firstImage(p);

  // restaurantId (se esiste)
  const restaurantId = p.restaurantId ?? restaurantIdFallback ?? null;

  return {
    raw: p,                // originale, se serve
    idmeals: p.idmeals,    // mantengo per compatibilità
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

// ---------- fallback foto da file (meals1.json via backend) ----------

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
  if (isValidImgPath(url)) {
    meal.immagine = url; // arricchisco il campo normalizzato
  }
  return meal;
}

// ====== nuovo: utilità cliente "aggiungi al carrello" (se non già definita) ======
if (typeof window.addToCart !== "function") {
  window.addToCart = function addToCart(meal) {
    const key = "cart";
    const cart = JSON.parse(localStorage.getItem(key) || "[]");
    cart.push({
      id: meal.id,
      nome: meal.nome,
      prezzo: meal.prezzo,
      restaurantId: meal.restaurantId,
      qty: 1
    });
    localStorage.setItem(key, JSON.stringify(cart));
    alert(` Added to cart: ${meal.nome}`);
  };
}

// --------------------------------------------------------------------

window.onload = async () => {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("loggedUser"));
  } catch { /* ignore */ }

  const role = user?.role || null;
  const isCustomer = role === "cliente";
  const isRestaurateur = role === "ristoratore";

  // === regole UI richieste ===
  // a) Solo i clienti possono vedere "ricerca ristoranti"
  try {
    const linkRR = document.querySelector('a[href="ricerca_ristoranti.html"]');
    if (linkRR) {
      const wrapper = linkRR.closest("p") || linkRR;
      wrapper.style.display = isCustomer ? "block" : "none";
    }
  } catch { /* ignore */ }

  // B) solo i clienti vedono "offerte speciali" (titolo H2 + UL)
  (function toggleSpecialOffers() {
    const ul = document.getElementById("special-offers");
    if (ul) {
      const prev = ul.previousElementSibling;
      if (isCustomer) {
        ul.style.display = ""; // visibile
        if (prev && prev.tagName === "H2") prev.style.display = "";
        // mostro placeholder se vuoto
        if (!ul.innerHTML.trim()) {
          ul.innerHTML = "<li>Loading...</li>";
        }
      } else {
        ul.innerHTML = "";
        ul.style.display = "none";
        if (prev && prev.tagName === "H2") prev.style.display = "none";
      }
    }
  })();

  // nascondi link "aggiungi" se non ristoratore (compatibilità)
  const linkAdd = document.getElementById("link-add");
  if (linkAdd && !isRestaurateur) linkAdd.style.display = "none";

  if (isRestaurateur && (!user.restaurantId || user.restaurantId === "")) {
    alert("Error: your restaurateur profile has no associated restaurantId.");
    return;
  }

  try {
    // 1) in parallelo: a) menu dal backend, b) mappa immagini dal file
    const [menuRes, imgMap] = await Promise.all([
      fetch(`${API_BASE}/meals`),
      buildFileImageMap(),
    ]);

    if (!menuRes.ok) {
      const body = await menuRes.text().catch(() => "");
      throw new Error(`GET /meals ${menuRes.status} – ${body}`);
    }
    const allData = await menuRes.json();

    // capisco se la struttura è annidata (array di ristoranti con menu) oppure piatta (lista piatti)
    const isNested = Array.isArray(allData) && allData.some(r => Array.isArray(r.menu));

    // tutti i piatti normalizzati
    const allMealsNormalized = isNested
      ? allData.flatMap(r => (r.menu || []).map(m => normalizeMeal(m, r.restaurantId)))
      : (Array.isArray(allData) ? allData.map(m => normalizeMeal(m)) : []);

    // applico fallback immagine da file dove mancante
    allMealsNormalized.forEach(m => applyImageFallbackFromMap(m, imgMap));

    // piatti da mostrare in tabella
    let mealsToShow = [];

    if (isRestaurateur) {
      if (isNested) {
        const ristorante = allData.find(r => String(r.restaurantId) === String(user.restaurantId));
        if (!ristorante) {
          alert(`Error: no menu found for your restaurantId (${user.restaurantId}).`);
          return;
        }
        mealsToShow = (ristorante.menu || []).map(m => normalizeMeal(m, ristorante.restaurantId));
      } else {
        // lista piatta: provo a filtrare per restaurantId se presente, altrimenti mostro tutto
        const filtered = allMealsNormalized.filter(m => String(m.restaurantId) === String(user.restaurantId));
        mealsToShow = filtered.length ? filtered : allMealsNormalized;
      }
    } else {
      // cliente o utente non loggato: mostra tutto
      // (le offerte sono già limitate ai soli clienti)
      mealsToShow = allMealsNormalized;
    }

    // fallback anche sui piatti mostrati (per sicurezza)
    mealsToShow.forEach(m => applyImageFallbackFromMap(m, imgMap));

    // salvo per filtro ingredienti
    window.__allMeals = mealsToShow;

    // render tabella classica
    renderTable(mealsToShow, isRestaurateur);

    // --- offerte speciali solo per cliente ---
    if (isCustomer) {
      const preferenza = user?.preferenza;
      const offersContainer = document.getElementById("special-offers");
      if (offersContainer) {
        if (!preferenza || preferenza === "") {
          offersContainer.innerHTML = "<li>No preference selected.</li>";
        } else {
          const suggestedMeals = allMealsNormalized
            .filter(p => (p.tipologia || "").toLowerCase() === String(preferenza).toLowerCase())
            .map(p => applyImageFallbackFromMap(p, imgMap));

          if (!suggestedMeals.length) {
            offersContainer.innerHTML = `<li>No dishes found for category "${preferenza}".</li>`;
          } else {
            offersContainer.innerHTML = suggestedMeals.map(p => `
              <li style="margin-bottom: 10px;">
                <img src="${pickImageURL(p)}"
                     alt="Photo" width="80" height="60"
                     style="vertical-align: middle; margin-right: 10px;">
                <strong>${p.nome}</strong> - €${formatPrice(p.prezzo)} ${p.tipologia ? `(${p.tipologia})` : ""}
              </li>
            `).join("");
          }
        }
      }
    }

    // filtro ingredienti live
    const filterInput = document.getElementById("filter-ingredient");
    if (filterInput) {
      filterInput.addEventListener("input", () => {
        const text = filterInput.value.trim().toLowerCase();
        const filtered = (window.__allMeals || []).filter(p =>
          (p.ingredients || []).some(i => String(i).toLowerCase().includes(text))
        );
        renderTable(filtered, isRestaurateur);
        // aggiorna anche la vista a sezioni se presente
        renderMenusGroupedSection(filtered, allData);
      });
    }

    // ====== nuovo: “menù per ristorante” se la pagina ha il contenitore ======
    renderMenusGroupedSection(mealsToShow, allData);

  } catch (err) {
    console.error("Errore nel caricamento del menu:", err);
    alert("Error loading menu");
  }
};

// ---- rendering tabella piatti ----
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
    const imgHTML = imgURL
      ? `<img src="${imgURL}" width="80" height="60" alt="Photo">`
      : "-";

    // bottone elimina solo se ristoratore e abbiamo un id (idmeals o _id valido)
    const hasIdMeals = meal.idmeals != null && meal.idmeals !== "";

    // vero _id Mongo (se presente e valido 24 hex)
    const oidRaw = meal.raw && typeof meal.raw._id === "string" ? meal.raw._id : "";
    const oidIsValid = /^[0-9a-fA-F]{24}$/.test(oidRaw);

    const canDelete = isRestaurateur && (hasIdMeals || oidIsValid);

    // salvo entrambi gli id nel dataset per tentare in ordine, ma solo se validi
    const deleteHTML = canDelete
      ? `<button class="btn-delete"
                  data-idmeals="${hasIdMeals ? String(meal.idmeals) : ""}"
                  data-oid="${oidIsValid ? oidRaw : ""}"
                  data-rid="${meal.restaurantId || ""}">Delete</button>`
      : "";

    tr.innerHTML = `
      <td>${meal.nome}</td>
      <td>€ ${formatPrice(meal.prezzo)}</td>
      <td>${meal.tipologia || "-"}</td>
      <td>${ings.length ? ings.join(", ") : "-"}</td>
      <td>${imgHTML}</td>
      <td>${deleteHTML}</td>
    `;

    // attach delete
    if (canDelete) {
      const btn = tr.querySelector(".btn-delete");
      btn.addEventListener("click", () => removeMeal(btn.dataset.idmeals, btn.dataset.oid, btn.dataset.rid));
    }

    tbody.appendChild(tr);
  });
}

// ---- elimina piatto (ristoratore) ----
async function removeMeal(idMeals, oid, rid) {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("loggedUser"));
  } catch { /* ignore */ }
  if (!user || !user.restaurantId) return;

  if (!confirm("Do you really want to delete this dish?")) return;

  const restaurantId = rid || user.restaurantId;

  // preparo gli ID validi
  const hasMealsId = idMeals != null && idMeals !== "";
  const hasOid = typeof oid === "string" && /^[0-9a-fA-F]{24}$/.test(oid);

  // creo la lista di tentativi in ordine preciso
  const attempts = [];
  if (hasMealsId) {
    attempts.push(`${API_BASE}/meals/${encodeURIComponent(idMeals)}`);                       // 1) semplice con idmeals
    attempts.push(`${API_BASE}/meals/${encodeURIComponent(restaurantId)}/${encodeURIComponent(idMeals)}`); // 2) annidata con idmeals
  }
  if (hasOid) {
    attempts.push(`${API_BASE}/meals/${encodeURIComponent(oid)}`);                          // 3) semplice con _id
    attempts.push(`${API_BASE}/meals/${encodeURIComponent(restaurantId)}/${encodeURIComponent(oid)}`);     // 4) annidata con _id
  }

  if (!attempts.length) {
    alert("Unable to delete: missing or invalid ID.");
    return;
  }

  const tryDelete = async (url) => {
    console.log("DELETE ->", url);
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
      // continua col prossimo
    }
  }

  alert("Error removing dish");
}

// ====== nuovo: rendering “menù per ristorante” (sezioni con nome proprietario) ======
function renderMenusGroupedSection(meals, rawAllData) {
  const root = document.getElementById("menu-by-restaurant");
  if (!root) return; // la pagina non vuole la vista a sezioni

  // costruisco mappa restaurantId -> { name, items[] }
  const groups = new Map();

  // provo a ricavare nomi ristorante da /meals (se annidato)
  if (Array.isArray(rawAllData) && rawAllData.some(r => Array.isArray(r.menu))) {
    for (const r of rawAllData) {
      const rid = String(r.restaurantId ?? r.id ?? r._id ?? "");
      const name = r.nome ?? r.name ?? r.restaurantName ?? (rid ? `Ristorante ${rid}` : "Ristorante");
      if (!groups.has(rid)) groups.set(rid, { name, items: [] });
    }
  }

  // fallback: arricchisco coi piatti e riempio i gruppi
  for (const p of meals || []) {
    const rid = String(p.restaurantId ?? "");
    if (!groups.has(rid)) {
      groups.set(rid, { name: rid ? `Ristorante ${rid}` : "Ristorante", items: [] });
    }
    groups.get(rid).items.push(p);
  }

  // ultimo step: se ho il div, provo ad aggiornare i nomi con /users/restaurants
  // (asincrono ma qui lo faccio sincrono: aggiornerò solo se necessario)
  const needsLookup = [...groups.values()].some(g => !g.name || /^Ristorante\s/.test(g.name));
  const enrichNames = async () => {
    if (!needsLookup) return;
    try {
      const ures = await fetch(`${API_BASE}/users/restaurants`, { mode: "cors" });
      if (!ures.ok) return;
      const rUsers = await ures.json();
      const byId = new Map(
        (Array.isArray(rUsers) ? rUsers : []).map(u => [String(u.restaurantId ?? u.id ?? u._id ?? ""), u])
      );
      for (const [rid, g] of groups.entries()) {
        const u = byId.get(rid);
        if (u) g.name = u.nome ?? u.name ?? g.name;
      }
    } catch { /* ignore */ }
  };

  // con nomi provvisori
  const draw = () => {
    root.innerHTML = "";
    const entries = [...groups.entries()].filter(([, g]) => (g.items || []).length > 0);

    if (!entries.length) {
      root.innerHTML = `<p>No restaurants available.</p>`;
      return;
    }

    // ordina alfabeticamente per nome ristorante
    entries.sort((a, b) => a[1].name.localeCompare(b[1].name));

    for (const [, g] of entries) {
      const section = document.createElement("section");
      section.className = "ristorante-section";

      const header = document.createElement("h2");
      header.className = "ristorante-title";
      header.textContent = `🍽️ ${g.name}`;
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

        // se l'utente è cliente, mostra "Aggiungi al carrello"
        const user = JSON.parse(localStorage.getItem("loggedUser") || "null");
        if (user?.role === "cliente") {
          const btn = document.createElement("button");
          btn.className = "btn-add";
          btn.textContent = "Add to cart";
          btn.addEventListener("click", () => addToCart(meal));
          card.appendChild(btn);
        }

        grid.appendChild(card);
      }

      section.appendChild(grid);
      root.appendChild(section);
    }
  };

  draw();
  // arricchisco i nomi e ridisegno se necessario
  enrichNames().then(draw).catch(() => {});
}
