// base URL: localhost in dev, Render in produzione
const API_BASE =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://restaurant-management-wzhj.onrender.com';

console.log('add.js loaded:', document.currentScript?.src);
console.log('API_BASE ->', API_BASE);

// helper: parse JSON in modo sicuro 
async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!ct.includes('application/json')) {
    // mostra un estratto utile per il debug
    const snippet = text.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`Non-JSON response (${res.status}) → ${snippet}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON parse error (${res.status}): ${e.message}`);
  }
}

// =================== gestione ingredienti manuali ===================
const ingredientInput = document.getElementById("ingredient-input");
const ingredientList  = document.getElementById("ingredient-list");
const addBtn          = document.getElementById("add-ingredient-btn");

let ingredients = [];

addBtn.addEventListener("click", () => {
  const ing = (ingredientInput.value || "").trim();
  if (ing && !ingredients.map(x => x.toLowerCase()).includes(ing.toLowerCase())) {
    ingredients.push(ing);
    updateIngredientList();
    ingredientInput.value = "";
  }
});

function updateIngredientList() {
  ingredientList.innerHTML = ingredients.map((ing, i) => `
    <li style="margin-bottom: 5px;">
      ${ing}
      <button type="button" onclick="removeIngredient(${i})" style="margin-left: 10px;" aria-label="Remove ingredient">❌</button>
    </li>
  `).join("");
}

window.removeIngredient = function(index) {
  ingredients.splice(index, 1);
  updateIngredientList();
};

// =================== submit: piatto personalizzato ===================
document.getElementById("meal-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const userStr = localStorage.getItem("loggedUser");
  const user = userStr ? JSON.parse(userStr) : null;

  if (!user || user.role !== "ristoratore") {
    alert("Unauthorized: a restaurateur account is required.");
    return;
  }
  if (!user.restaurantId) {
    alert("No restaurantId associated with this user. Please log in again as a restaurateur.");
    return;
  }

  const nome        = document.getElementById("name").value.trim();
  const prezzo      = parseFloat(document.getElementById("price").value);
  const descrizione = document.getElementById("description").value.trim();
  const tipologia   = document.getElementById("preferenza").value; // <- allineato con l'HTML
  const immagine    = document.getElementById("image").value.trim();

  if (!nome || Number.isNaN(prezzo)) {
    alert("Please enter a valid name and price.");
    return;
  }

  const newMeal = {
    restaurantId: user.restaurantId,
    nome,
    prezzo,
    descrizione,
    tipologia,
    ingredients,      // dagli input manuali sopra
    immagine,
    origine: "personalizzato"
  };

  try {
    const res = await fetch(`${API_BASE}/meals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMeal)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status} - ${errText || 'Save error'}`);
    }

    alert("Dish added!");
    window.location.href = "index.html";
  } catch (err) {
    console.error("Network/save error:", err);
    alert(String(err.message || err));
  }
});

// =================== piatti comuni (cards + "Aggiungi al mio menu") ===================
window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById("common-meals-container");
  if (!container) return;

  const userStr = localStorage.getItem("loggedUser");
  const user = userStr ? JSON.parse(userStr) : null;

  if (!user || user.role !== "ristoratore" || !user.restaurantId) {
    container.innerHTML = "<p>Only restaurateurs can view common dishes.</p>";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/meals/common-meals`);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`HTTP ${res.status} - ${t || 'Load error'}`);
    }

    const commonMeals = await safeJson(res); // evita "unexpected token <" su error pages
    container.innerHTML = "";

    commonMeals.forEach(raw => {
      // normalizzazione campi 
      const nome        = raw.strMeal         || raw.nome        || raw.name || "No name";
      const categoria   = raw.strCategory     || raw.tipologia   || raw.category || "-";
      const istruzioni  = raw.strInstructions || raw.descrizione || "-";
      const img         = raw.strMealThumb    || raw.immagine    || "";
      let ings = [];

      // se formato TheMealDB: strIngredient1..20
      if (typeof raw.strIngredient1 !== "undefined") {
        for (let i = 1; i <= 20; i++) {
          const ing = raw["strIngredient" + i];
          if (ing && String(ing).trim()) ings.push(ing.trim());
        }
      } else if (Array.isArray(raw.ingredients)) {
        ings = raw.ingredients;
      }

      // UI card
      const card = document.createElement("div");
      card.style.border = "1px solid #ccc";
      card.style.marginBottom = "10px";
      card.style.padding = "10px";
      card.style.borderRadius = "8px";

      card.innerHTML = `
        <strong>${nome}</strong> <small>(${categoria})</small><br>
        ${img ? `<img src="${img}" alt="${nome}" width="150" style="margin:6px 0;border-radius:6px;">` : ""}
        <div style="font-size: 12px; color:#444;"><em>${istruzioni}</em></div>
        <div style="font-size: 12px; margin-top:4px;"><small>Ingredients: ${ings.join(", ") || "-"}</small></div>
        <button type="button" class="add-btn" style="margin-top:8px;">Add to my menu</button>
      `;

      card.querySelector(".add-btn").addEventListener("click", async () => {
        const nuovoPiatto = {
          restaurantId: user.restaurantId,
          nome,
          prezzo: raw.prezzo || 10,
          descrizione: istruzioni,
          tipologia: categoria,
          immagine: img,
          origine: "comune",
          ingredients: ings
        };

        try {
          const addRes = await fetch(`${API_BASE}/meals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nuovoPiatto)
          });

          if (!addRes.ok) {
            const addTxt = await addRes.text();
            throw new Error(`HTTP ${addRes.status} - ${addTxt || 'Save error'}`);
          }

          alert("Dish added to your menu!");
          window.location.href = "index.html";
        } catch (err) {
          console.error("Common dish add error:", err);
          alert(String(err.message || err));
        }
      });

      container.appendChild(card);
    });

  } catch (err) {
    console.error("Error loading common dishes:", err);
    container.innerHTML = `<p style="color:#b00;">${String(err.message || 'Error loading common dishes.')}</p>`;
  }
});
