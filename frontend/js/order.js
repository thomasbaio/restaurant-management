// --- auth guard ---
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

// estrai tutti i piatti anche se l’endpoint restituisce ristoranti con menu annidati
function extractAllMeals(data) {
  const found = [];
  function recurse(node) {
    if (Array.isArray(node)) {
      node.forEach(recurse);
    } else if (node && typeof node === "object") {
      // se sembra un piatto, normalizza e conserva solo quelli con id+prezzo validi
      const n = normalizeMeal(node);
      if (n.id && Number.isFinite(n.price)) {
        found.push(n);
      }
      // continua a scendere
      Object.values(node).forEach(recurse);
    }
  }
  recurse(data);
  return found;
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
    const meals = extractAllMeals(rawData);

    if (meals.length === 0) {
      list.innerHTML = `<p>No dishes available.</p>`;
      return;
    }

    // render lista
    list.innerHTML = "";
    meals.forEach(meal => {
      const container = document.createElement("div");
      container.className = "meal-item";

      const imgHtml = meal.thumb
        ? `<img src="${meal.thumb}" alt="${meal.name}" class="meal-thumb" onerror="this.style.display='none'">`
        : "";

      container.innerHTML = `
        <label class="meal-row">
          <input type="checkbox" name="meal" value="${meal.id}" data-price="${meal.price}">
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

      list.appendChild(container);
    });

    // totale dinamico
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

// --- invio ordine ---
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
