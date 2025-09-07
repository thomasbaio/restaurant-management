const user = JSON.parse(localStorage.getItem("loggedUser"));
if (!user) {
  alert("You must be logged in to place an order");
  window.location.href = "login.html";
  // IMPORTANT: interrompi l'esecuzione
  throw new Error("User not logged in");
}

// --- base URL (locale vs produzione) ---
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const DEFAULT_API_BASE = isLocal
  ? "http://localhost:3000"
  : "https://restaurant-management-wzhj.onrender.com";

// permette override da console/localStorage senza toccare il codice
const API_BASE = localStorage.getItem("API_BASE") || DEFAULT_API_BASE;

// helper: fetch JSON provando più path (es. /meals e /api/meals)
async function fetchJSONWithFallback(paths) {
  let lastErr;
  for (const p of paths) {
    try {
      const res = await fetch(`${API_BASE}${p}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Fetch failed");
}

// --- normalizzazione piatto ---
function normalizeMeal(raw) {
  // id
  let id =
    raw.idmeals ?? raw.idMeal ?? raw.id ?? raw._id ?? null;
  if (id != null) id = String(id);

  // nome
  const name = raw.nome ?? raw.strMeal ?? raw.name ?? "No name";

  // prezzo
  let price = raw.prezzo ?? raw.price ?? null;
  if (typeof price === "string") {
    const num = Number(price.replace(",", "."));
    price = Number.isFinite(num) ? num : null;
  }

  // tipologia / categoria
  const category = raw.tipologia ?? raw.category ?? raw.strCategory ?? "";

  // descrizione
  const description = raw.descrizione ?? raw.description ?? raw.strInstructions ?? "";

  // immagine
  const thumb =
    raw.foto ??
    raw.image ??
    raw.strMealThumb ??
    "";

  return { id, name, price, category, description, thumb };
}

/**
 * estrae i piatti raggruppandoli per ristorante.
 * supporta sia:
 *  - struttura: [{ restaurantId, nome, menu: [...] }, ...]
 *  - struttura piatta: [ { ..., restaurantId, ... }, ... ]
 *  - strutture annidate miste (fallback).
 *
 * ritorna: Array<{ restaurantId, restaurantName, items: NormalizedMeal[] }>
 */
function extractMealsByRestaurant(data) {
  const groups = new Map(); // key: restaurantId (string) -> { restaurantId, restaurantName, items: [] }

  const ensureGroup = (rid, rname) => {
    const key = String(rid || "unknown");
    if (!groups.has(key)) {
      groups.set(key, {
        restaurantId: key,
        restaurantName: (rname && String(rname)) || (key === "unknown" ? "Other restaurants" : `Restaurant ${key}`),
        items: []
      });
    } else if (rname) {
      // se arriva un nome migliore, aggiorna
      const g = groups.get(key);
      if (!g.restaurantName || g.restaurantName.startsWith("Restaurant ")) {
        g.restaurantName = String(rname);
      }
    }
    return groups.get(key);
  };

  // caso A: array top-level
  if (Array.isArray(data)) {
    data.forEach(node => {
      if (node && typeof node === "object" && Array.isArray(node.menu)) {
        // Oggetto ristorante classico
        const rid = node.restaurantId ?? node.idRestaurant ?? node.id ?? node._id ?? "unknown";
        const rname = node.nome ?? node.name ?? node.restaurantName ?? "";
        const group = ensureGroup(rid, rname);

        node.menu.forEach(p => {
          const n = normalizeMeal(p);
          if (n.id && Number.isFinite(n.price)) group.items.push(n);
        });
      } else {
        // Può essere un piatto piatto con restaurantId
        const maybeMeal = normalizeMeal(node || {});
        if (maybeMeal.id && Number.isFinite(maybeMeal.price)) {
          const rid = node?.restaurantId ?? "unknown";
          const rname = node?.restaurantName ?? "";
          const group = ensureGroup(rid, rname);
          group.items.push(maybeMeal);
        }
      }
    });
  } else if (data && typeof data === "object") {
    // caso B: oggetto singolo (fallback) – ricorsione leggera
    const stack = [data];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== "object") continue;

      if (Array.isArray(cur.menu)) {
        const rid = cur.restaurantId ?? cur.idRestaurant ?? cur.id ?? cur._id ?? "unknown";
        const rname = cur.nome ?? cur.name ?? cur.restaurantName ?? "";
        const group = ensureGroup(rid, rname);
        cur.menu.forEach(p => {
          const n = normalizeMeal(p);
          if (n.id && Number.isFinite(n.price)) group.items.push(n);
        });
      } else {
        // spingi figli
        Object.values(cur).forEach(v => {
          if (v && typeof v === "object") stack.push(v);
          if (Array.isArray(v)) v.forEach(x => x && typeof x === "object" && stack.push(x));
        });
      }
    }
  }

  // filtra gruppi senza items
  const arr = Array.from(groups.values()).filter(g => g.items.length > 0);

  // ordina alfabeticamente per nome ristorante
  arr.sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));

  return arr;
}

window.onload = async function () {
  const list = document.getElementById("meals-list");
  const totalDisplay = document.getElementById("total");

  if (!list || !totalDisplay) {
    console.error("Missing #meals-list or #total elements in HTML");
    return;
  }

  try {
    // prova /meals e in fallback /api/meals
    const rawData = await fetchJSONWithFallback(["/meals", "/api/meals"]);

    //  gruppi per ristorante ---
    const groups = extractMealsByRestaurant(rawData);

    if (groups.length === 0) {
      list.innerHTML = `<p>No dishes available.</p>`;
      return;
    }

    // render lista per gruppi
    list.innerHTML = "";
    groups.forEach(group => {
      const section = document.createElement("fieldset");
      section.className = "restaurant-section";
      const legend = document.createElement("legend");
      legend.textContent = group.restaurantName;
      section.appendChild(legend);

      group.items.forEach(meal => {
        const container = document.createElement("div");
        container.className = "meal-item";

        const imgHtml = meal.thumb
          ? `<img src="${meal.thumb}" alt="${meal.name}" class="meal-thumb" onerror="this.style.display='none'">`
          : "";

        container.innerHTML = `
          <label class="meal-row">
            <input type="checkbox" name="meal" value="${meal.id}" data-price="${meal.price}" data-restaurant="${group.restaurantId}">
            <div class="meal-info">
              <div class="meal-title">
                <strong>${meal.name}</strong>
                <span class="meal-price">€${meal.price.toFixed(2)}</span>
              </div>
              ${meal.category ? `<em class="meal-cat">${meal.category}</em>` : ""}
              ${meal.description ? `<small class="meal-desc">${meal.description}</small>` : ""}
            </div>
            ${imgHtml}
          </label>
        `;
        section.appendChild(container);
      });

      list.appendChild(section);
    });

    // totale dinamico (invariato)
    function recomputeTotal() {
      const selected = list.querySelectorAll('input[name="meal"]:checked');
      let total = 0;
      selected.forEach(el => {
        const p = Number(el.dataset.price);
        if (Number.isFinite(p)) total += p;
      });
      totalDisplay.textContent = `Total: €${total.toFixed(2)}`;
    }
    list.addEventListener("change", recomputeTotal);
    recomputeTotal();

  } catch (err) {
    console.error("Error loading menu:", err);
    alert(
      `Error loading the menu.\n` +
      `Base URL: ${API_BASE}\n` +
      `Details: ${err.message}\n\n` +
      `Tips:\n- If you're local, start the backend (npm start).\n` +
      `- To force the production URL run in console:\n  localStorage.setItem('API_BASE','https://restaurant-management-wzhj.onrender.com');\n  then reload the page.`
    );
  }
};

// --- invio ordine (invariato) ---
const form = document.getElementById("order-form");
if (form) {
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const selectedMeals = Array.from(
      document.querySelectorAll('input[name="meal"]:checked')
    ).map(m => String(m.value)); // mantieni ID come stringa

    if (selectedMeals.length === 0) {
      alert("Select at least one dish.");
      return;
    }

    const order = {
      username: user.username,
      role: user.role,
      meals: selectedMeals, // array di stringhe
      delivery: "domicilio",  // consegna a domicilio (asporto non disponibile)
      stato: "ordinato"
    };

    localStorage.setItem("pendingOrder", JSON.stringify(order));
    window.location.href = "payment.html"; // pagina simulata
  });
}
