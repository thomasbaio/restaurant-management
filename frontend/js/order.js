const user = JSON.parse(localStorage.getItem("loggedUser"));
if (!user) {
  alert("Devi essere loggato per ordinare");
  window.location.href = "login.html";
}

window.onload = async function () {
  try {
    const mealsRes = await fetch("http://localhost:3000/meals");
    const rawData = await mealsRes.json();
    const list = document.getElementById("meals-list");
    const totalDisplay = document.getElementById("total");

    // 🔁 Estrai tutti i piatti anche annidati
    function extractAllMeals(data) {
      const found = [];
      function recurse(node) {
        if (Array.isArray(node)) {
          node.forEach(recurse);
        } else if (node && typeof node === "object") {
          if ("nome" in node && "prezzo" in node) {
            found.push(node);
          }
          Object.values(node).forEach(recurse);
        }
      }
      recurse(data);
      return found;
    }

    const meals = extractAllMeals(rawData);

    meals.forEach(meal => {
      const id = meal.idmeals || meal.id || null;
      const name = meal.nome || meal.name || "Senza nome";
      const price = typeof meal.prezzo === "number" ? meal.prezzo : (typeof meal.price === "number" ? meal.price : null);
      const description = meal.descrizione || meal.description || "";
      const category = meal.tipologia || meal.category || "";

      if (id !== null && price !== null) {
        const container = document.createElement("div");
        container.classList.add("meal-item");

        container.innerHTML = `
          <label>
            <input type="checkbox" name="meal" value="${id}" data-price="${price}">
            <strong>${name}</strong> - €${price.toFixed(2)}
            <em>${category}</em><br>
            <small>${description}</small>
          </label>
        `;

        list.appendChild(container);
      }
    });

    // 🔄 Ricalcola totale ogni volta che cambia selezione
    list.addEventListener("change", () => {
      const selected = document.querySelectorAll('input[name="meal"]:checked');
      let total = 0;
      selected.forEach(el => {
        total += parseFloat(el.dataset.price);
      });
      totalDisplay.textContent = `Totale: €${total.toFixed(2)}`;
    });

  } catch (err) {
    console.error("Errore nel caricamento dei piatti:", err);
    alert("Errore nel caricamento del menu.");
  }
};

document.getElementById("order-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const selectedMeals = Array.from(document.querySelectorAll('input[name="meal"]:checked')).map(m => parseInt(m.value));

  if (selectedMeals.length === 0) {
    alert("Seleziona almeno un piatto.");
    return;
  }

  const order = {
    username: user.username,
    role: user.role,
    meals: selectedMeals,
    delivery: "asporto", // sempre ritiro al ristorante
    stato: "ordinato"
  };

  localStorage.setItem("pendingOrder", JSON.stringify(order));
  window.location.href = "payment.html"; // pagina simulata
});

