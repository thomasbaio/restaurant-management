// 🎯 Ingredienti dinamici
// add.js — aggiunta piatto + piatti comuni (compat)
// Base URL: localhost in dev, Render in produzione
const API_BASE =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://restaurant-management-wzhj.onrender.com';

console.log('API_BASE ->', API_BASE);

// =================== Gestione ingredienti manuali ===================
const ingredientInput = document.getElementById("ingredient-input");
const ingredientList  = document.getElementById("ingredient-list");
const addBtn          = document.getElementById("add-ingredient-btn");

let ingredients = [];

addBtn.addEventListener("click", () => {
  const ing = (ingredientInput.value || "").trim();
  if (ing && !ingredients.includes(ing)) {
    ingredients.push(ing);
    updateIngredientList();
    ingredientInput.value = "";
  }
});

function updateIngredientList() {
  ingredientList.innerHTML = ingredients.map((ing, i) => `
    <li style="margin-bottom: 5px;">
      ${ing}
      <button type="button" onclick="removeIngredient(${i})" style="margin-left: 10px;">❌</button>
    </li>
  `).join("");
}

window.removeIngredient = function(index) {
  ingredients.splice(index, 1);
  updateIngredientList();
};

// =================== Submit: PIATTO PERSONALIZZATO ===================
document.getElementById("meal-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const user = JSON.parse(localStorage.getItem("loggedUser") || "null");
  if (!user || user.role !== "ristoratore") {
    alert("Accesso non autorizzato: serve un account ristoratore.");
    return;
  }
  if (!user.restaurantId) {
    alert("Nessun restaurantId associato all'utente. Riesegui il login ristoratore.");
    return;
  }

  const nome        = document.getElementById("name").value.trim();
  const prezzo      = parseFloat(document.getElementById("price").value);
  const descrizione = document.getElementById("description").value.trim();
  const tipologia   = document.getElementById("category").value;
  const immagine    = document.getElementById("image").value.trim();

  if (!nome || Number.isNaN(prezzo)) {
    alert("Inserisci un nome e un prezzo validi.");
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

    const txt = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${txt || 'Errore nel salvataggio'}`);

    alert("Piatto aggiunto!");
    window.location.href = "index.html";
  } catch (err) {
    console.error("Errore di rete/salvataggio:", err);
    alert(String(err.message || err));
  }
});

// =================== Piatti comuni (cards + "Aggiungi al mio menu") ===================
window.onload = async function () {
  const container = document.getElementById("common-meals-container");
  const user = JSON.parse(localStorage.getItem("loggedUser") || "null");

  if (!user || user.role !== "ristoratore" || !user.restaurantId) {
    if (container) container.innerHTML = "<p>Solo i ristoratori possono vedere i piatti comuni.</p>";
    return;
  }

  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/meals/common-meals`);
    const txt = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${txt || 'Errore nel caricamento'}`);

    const commonMeals = JSON.parse(txt); // può essere TheMealDB-like o nostro JSON

    container.innerHTML = "";
    commonMeals.forEach(raw => {
      // Normalizzazione campi (TheMealDB oppure schema locale)
      const nome        = raw.strMeal       || raw.nome        || raw.name || "Senza nome";
      const categoria   = raw.strCategory   || raw.tipologia   || raw.category || "-";
      const istruzioni  = raw.strInstructions || raw.descrizione || "-";
      const img         = raw.strMealThumb  || raw.immagine    || "";
      let ings = [];

      // Se formato TheMealDB: strIngredient1..20
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
        <div style="font-size: 12px; margin-top:4px;"><small>Ingredienti: ${ings.join(", ") || "-"}</small></div>
        <button type="button" class="add-btn" style="margin-top:8px;">Aggiungi al mio menu</button>
      `;

      card.querySelector(".add-btn").addEventListener("click", async () => {
        const nuovoPiatto = {
          restaurantId: user.restaurantId,   // richiesto dal backend
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

          const addTxt = await addRes.text();
          if (!addRes.ok) throw new Error(`HTTP ${addRes.status} - ${addTxt || 'Errore nel salvataggio'}`);

          alert("Piatto aggiunto al menu!");
          window.location.href = "index.html";
        } catch (err) {
          console.error("Errore aggiunta piatto comune:", err);
          alert(String(err.message || err));
        }
      });

      container.appendChild(card);
    });

  } catch (err) {
    console.error("Errore nel caricamento dei piatti comuni:", err);
    container.innerHTML = "<p>Errore nel caricamento dei piatti comuni.</p>";
  }
};
