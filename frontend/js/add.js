// 🎯 Ingredienti dinamici
const ingredientInput = document.getElementById("ingredient-input");
const ingredientList = document.getElementById("ingredient-list");
const addBtn = document.getElementById("add-ingredient-btn");

let ingredients = [];

addBtn.addEventListener("click", () => {
  const ing = ingredientInput.value.trim();
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

// ✅ SUBMIT FORM PIATTO PERSONALIZZATO
document.getElementById("meal-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || user.role !== "ristoratore") {
    alert("Accesso non autorizzato.");
    return;
  }

  const nome = document.getElementById("name").value.trim();
  const prezzo = parseFloat(document.getElementById("price").value);
  const descrizione = document.getElementById("description").value.trim();
  const tipologia = document.getElementById("category").value;
  const immagine = document.getElementById("image").value.trim();

  if (!nome || isNaN(prezzo)) {
    alert("Inserisci nome e prezzo validi.");
    return;
  }

  const newMeal = {
    restaurantId: user.restaurantId,
    nome,
    prezzo,
    descrizione,
    tipologia,
    ingredients,
    immagine,
    origine: "personalizzato"
  };

  try {
    const res = await fetch("http://localhost:3000/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMeal)
    });

    if (res.ok) {
      alert("Piatto aggiunto!");
      window.location.href = "index.html";
    } else {
      const errorText = await res.text();
      alert("Errore: " + errorText);
    }
  } catch (err) {
    alert("Errore di rete");
    console.error(err);
  }
});

// 🔽 Carica piatti comuni da backend
window.onload = async function () {
  const container = document.getElementById("common-meals-container");
  const user = JSON.parse(localStorage.getItem("loggedUser"));

  if (!user || user.role !== "ristoratore" || !user.restaurantId) {
    container.innerHTML = "<p>Solo i ristoratori possono vedere i piatti comuni.</p>";
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/meals/common-meals");
    const commonMeals = await res.json();

    container.innerHTML = "";

    commonMeals.forEach(meal => {
      const card = document.createElement("div");
      card.style.border = "1px solid #ccc";
      card.style.marginBottom = "10px";
      card.style.padding = "10px";

      const nome = meal.strMeal || "Senza nome";
      const categoria = meal.strCategory || "-";
      const istruzioni = meal.strInstructions || "-";
      const img = meal.strMealThumb || "";
      const ingredients = [];

      for (let i = 1; i <= 20; i++) {
        const ing = meal["strIngredient" + i];
        if (ing) ingredients.push(ing);
      }

      card.innerHTML = `
        <strong>${nome}</strong> (${categoria})<br>
        ${img ? `<img src="${img}" alt="${nome}" width="150"><br>` : ""}
        <em>${istruzioni}</em><br>
        <small>Ingredients: ${ingredients.join(", ")}</small><br><br>
        <button>Aggiungi al mio menu</button>
      `;

      card.querySelector("button").addEventListener("click", async () => {
        const nuovoPiatto = {
          restaurantId: user.restaurantId,
          nome,
          prezzo: 10,
          descrizione: istruzioni,
          tipologia: categoria,
          immagine: img,
          origine: "comune",
          ingredients
        };

        try {
          const addRes = await fetch("http://localhost:3000/meals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nuovoPiatto)
          });

          if (addRes.ok) {
            alert("Piatto aggiunto al menu!");
            window.location.href = "index.html";
          } else {
            const errorText = await addRes.text();
            alert("Errore: " + errorText);
          }
        } catch (err) {
          console.error(err);
          alert("Errore di rete");
        }
      });

      container.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Errore nel caricamento dei piatti comuni.</p>";
  }
};


