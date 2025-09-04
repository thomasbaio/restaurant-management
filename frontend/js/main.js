// Base URL per API: locale vs produzione
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

// ---- Helpers di normalizzazione ----

// Estrai array ingredienti (il backend ora garantisce "ingredients")
function extractIngredients(p) {
  return Array.isArray(p.ingredients) ? p.ingredients.filter(Boolean) : [];
}

// Valida una stringa come URL immagine accettabile (http/https o path relativo /...)
function isValidImgPath(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t || t === "-") return false;
  return /^https?:\/\//i.test(t) || t.startsWith("/");
}

// Trova il primo campo immagine davvero valido tra vari alias
function firstImage(p) {
  const cands = [
    p.immagine, p.foto, p.strMealThumb, p.image, p.thumb, p.picture, p.img
  ];
  for (const c of cands) {
    if (isValidImgPath(c)) return String(c).trim();
  }
  return "";
}

// Normalizza un piatto a un formato coerente per il rendering
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

  // immagine: prendi SOLO una URL valida, ignorando "-", ""
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

// Rende sicuro il toFixed
function formatPrice(n) {
  return (typeof n === "number" && isFinite(n)) ? n.toFixed(2) : "n.d.";
}

// ---- Selezione URL immagine con fallback/placeholder ----
function pickImageURL(p) {
  // p è già normalizzato e ha p.immagine pulita; ma restiamo robusti
  let cand = firstImage(p);
  if (isValidImgPath(cand)) {
    // Se è path relativo, attacca l'origine
    if (cand.startsWith("/")) return `${location.origin}${cand}`;
    return cand; // http/https
  }
  // Placeholder
  const label = encodeURIComponent((p.nome || "Food").split(" ")[0]);
  return `https://placehold.co/80x60?text=${label}`;
}

window.onload = async () => {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("loggedUser"));
  } catch { /* ignore */ }

  const isRistoratore = user && user.role === "ristoratore";

  // Nascondi link "aggiungi" se non ristoratore
  const linkAdd = document.getElementById("link-add");
  if (linkAdd && !isRistoratore) linkAdd.style.display = "none";

  if (isRistoratore && (!user.restaurantId || user.restaurantId === "")) {
    alert("Errore: il tuo profilo ristoratore non ha un restaurantId associato.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/meals`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GET /meals ${res.status} – ${body}`);
    }
    const allData = await res.json();

    // Capisco se la struttura è annidata (array di ristoranti con menu) oppure piatta (lista piatti)
    const isNested = Array.isArray(allData) && allData.some(r => Array.isArray(r.menu));

    // Tutti i piatti normalizzati (per offerte/filtri)
    const allMealsNormalized = isNested
      ? allData.flatMap(r => (r.menu || []).map(m => normalizeMeal(m, r.restaurantId)))
      : (Array.isArray(allData) ? allData.map(m => normalizeMeal(m)) : []);

    // Piatti da mostrare in tabella
    let piattiDaMostrare = [];

    if (isRistoratore) {
      if (isNested) {
        const ristorante = allData.find(r => String(r.restaurantId) === String(user.restaurantId));
        if (!ristorante) {
          alert(`Errore: nessun menu trovato per il tuo restaurantId (${user.restaurantId}).`);
          return;
        }
        piattiDaMostrare = (ristorante.menu || []).map(m => normalizeMeal(m, ristorante.restaurantId));
      } else {
        const filtered = allMealsNormalized.filter(m => String(m.restaurantId) === String(user.restaurantId));
        piattiDaMostrare = filtered.length ? filtered : allMealsNormalized;
      }
    } else {
      piattiDaMostrare = allMealsNormalized;
    }

    // salvo per filtro ingredienti
    window.__tuttiIPiatti = piattiDaMostrare;

    // render tabella
    renderTable(piattiDaMostrare, isRistoratore);

    // Offerte speciali per cliente, basate su preferenza tipologica
    if (user && user.role === "cliente") {
      const preferenza = user.preferenza;
      const offerteContainer = document.getElementById("offerte-speciali");
      if (offerteContainer) {
        if (!preferenza || preferenza === "") {
          offerteContainer.innerHTML = "<li>Nessuna preferenza selezionata.</li>";
        } else {
          const piattiConsigliati = allMealsNormalized.filter(
            p => (p.tipologia || "").toLowerCase() === String(preferenza).toLowerCase()
          );
          if (!piattiConsigliati.length) {
            offerteContainer.innerHTML = `<li>Nessun piatto trovato per la categoria "${preferenza}".</li>`;
          } else {
            offerteContainer.innerHTML = piattiConsigliati.map(p => `
              <li style="margin-bottom: 10px;">
                <img src="${pickImageURL(p)}"
                     alt="Foto" width="80" height="60"
                     style="vertical-align: middle; margin-right: 10px;">
                <strong>${p.nome}</strong> - €${formatPrice(p.prezzo)} ${p.tipologia ? `(${p.tipologia})` : ""}
              </li>
            `).join("");
          }
        }
      }

      // Filtro ingredienti live
      const filtroInput = document.getElementById("filtro-ingrediente");
      if (filtroInput) {
        filtroInput.addEventListener("input", () => {
          const testo = filtroInput.value.trim().toLowerCase();
          const filtrati = (window.__tuttiIPiatti || []).filter(p =>
            (p.ingredients || []).some(i => String(i).toLowerCase().includes(testo))
          );
          renderTable(filtrati, false);
        });
      }
    }

  } catch (err) {
    console.error("Errore nel caricamento del menu:", err);
    alert("Errore nel caricamento del menu");
  }
};

// ---- Rendering tabella piatti ----
function renderTable(piatti, isRistoratore) {
  const tbody = document.getElementById("menu-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!piatti || !piatti.length) {
    tbody.innerHTML = '<tr><td colspan="6">Nessun piatto trovato</td></tr>';
    return;
  }

  piatti.forEach(piatto => {
    const tr = document.createElement("tr");
    const ings = Array.isArray(piatto.ingredients) ? piatto.ingredients.filter(Boolean) : [];

    const imgURL = pickImageURL(piatto);
    const imgHTML = imgURL
      ? `<img src="${imgURL}" width="80" height="60" alt="Foto">`
      : "-";

    const hasIdMeals = piatto.idmeals != null && piatto.idmeals !== "";
    const oidRaw = piatto.raw && typeof piatto.raw._id === "string" ? piatto.raw._id : "";
    const oidIsValid = /^[0-9a-fA-F]{24}$/.test(oidRaw);
    const canDelete = isRistoratore && (hasIdMeals || oidIsValid);

    const eliminaHTML = canDelete
      ? `<button class="btn-delete"
                  data-idmeals="${hasIdMeals ? String(piatto.idmeals) : ""}"
                  data-oid="${oidIsValid ? oidRaw : ""}"
                  data-rid="${piatto.restaurantId || ""}">Elimina</button>`
      : "";

    tr.innerHTML = `
      <td>${piatto.nome}</td>
      <td>€ ${formatPrice(piatto.prezzo)}</td>
      <td>${piatto.tipologia || "-"}</td>
      <td>${ings.length ? ings.join(", ") : "-"}</td>
      <td>${imgHTML}</td>
      <td>${eliminaHTML}</td>
    `;

    if (canDelete) {
      const btn = tr.querySelector(".btn-delete");
      btn.addEventListener("click", () => rimuovi(btn.dataset.idmeals, btn.dataset.oid, btn.dataset.rid));
    }

    tbody.appendChild(tr);
  });
}

// ---- Elimina piatto (ristoratore) ----
async function rimuovi(idMeals, oid, rid) {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("loggedUser"));
  } catch { /* ignore */ }
  if (!user || !user.restaurantId) return;

  if (!confirm("Vuoi davvero eliminare questo piatto?")) return;

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
    alert("Impossibile eliminare: ID mancante o non valido.");
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
    }
  }

  alert("Errore nella rimozione del piatto");
}
