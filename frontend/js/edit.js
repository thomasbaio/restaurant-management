const params = new URLSearchParams(window.location.search);
const id = parseInt(params.get("id"));

if (!id || isNaN(id)) {
  alert("Invalid dish ID.");
  window.location.href = "index.html";
}

// Base URL: localhost in dev, Render in produzione
const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://restaurant-management-wzhj.onrender.com";

window.onload = async () => {
  try {
    // 📌 Recupera tutti i ristoranti e i loro piatti
    const res = await fetch(`${API_BASE}/meals`);
    if (!res.ok) throw new Error("Server response error");
    const restaurants = await res.json();

    // cerca il piatto da modificare
    let foundMeal = null;
    for (const rest of restaurants) {
      const meal = rest.menu?.find(m => m.idmeals === id);
      if (meal) {
        foundMeal = meal;
        break;
      }
    }

    if (!foundMeal) {
      alert("Dish not found.");
      window.location.href = "index.html";
      return;
    }

    // popola il form
    document.getElementById("name").value = foundMeal.nome ?? "";
    document.getElementById("price").value = foundMeal.prezzo ?? "";
    document.getElementById("description").value = foundMeal.descrizione ?? "";

    // supporta sia 'ingredienti' che 'ingredients'
    const ingList = Array.isArray(foundMeal.ingredienti)
      ? foundMeal.ingredienti
      : (Array.isArray(foundMeal.ingredients) ? foundMeal.ingredients : []);
    document.getElementById("ingredients").value = ingList.join(", ");

    // allineato al tuo HTML: select con id="preferenza"
    const catSel = document.getElementById("preferenza") || document.getElementById("category");
    if (catSel) catSel.value = foundMeal.tipologia ?? "";

    // gestione submit
    document.getElementById("edit-form").addEventListener("submit", async (e) => {
      e.preventDefault();

      // normalizza lista ingredienti
      const ingFieldRaw = document.getElementById("ingredients").value;
      const normalizedIngs = (ingFieldRaw || "")
        .split(",")
        .map(i => i.trim())
        .filter(i => i.length > 0);

      // legge categoria da 'preferenza' (fallback 'category' se esiste)
      const catInput = document.getElementById("preferenza") || document.getElementById("category");

      const updatedMeal = {
        nome: document.getElementById("name").value.trim(),
        prezzo: parseFloat(document.getElementById("price").value) || 0,
        descrizione: document.getElementById("description").value.trim(),
        tipologia: (catInput?.value || "").trim(),

        // per compatibilità con dati esistenti:
        ingredienti: normalizedIngs,
        ingredients: normalizedIngs
      };

      try {
        const updateRes = await fetch(`${API_BASE}/meals/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedMeal)
        });

        if (updateRes.ok) {
          alert("Dish updated!");
          window.location.href = "index.html";
        } else {
          const errText = await updateRes.text();
          alert("Error while saving: " + (errText || "Unknown error"));
        }
      } catch (err) {
        console.error("Error while saving:", err);
        alert("Network error.");
      }
    });
  } catch (err) {
    console.error("Error:", err);
    alert("Error while loading.");
  }
};
