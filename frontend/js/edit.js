const params = new URLSearchParams(window.location.search);
const id = parseInt(params.get("id"));

if (!id) {
  alert("ID piatto non valido.");
  window.location.href = "index.html";
}

window.onload = async () => {
  try {
    const res = await fetch("http://localhost:3000/meals");
    const restaurants = await res.json();

    let foundMeal = null;

    for (const rest of restaurants) {
      const meal = rest.menu?.find(m => m.idmeals === id);
      if (meal) {
        foundMeal = meal;
        break;
      }
    }

    if (!foundMeal) {
      alert("Piatto non trovato.");
      return;
    }

    // Popola il form
    document.getElementById("name").value = foundMeal.nome || "";
    document.getElementById("price").value = foundMeal.prezzo || "";
    document.getElementById("description").value = foundMeal.descrizione || "";
    document.getElementById("ingredients").value = (foundMeal.ingredienti || []).join(", ");
    document.getElementById("category").value = foundMeal.tipologia || "";

    // Salva modifiche
    document.getElementById("edit-form").addEventListener("submit", async (e) => {
      e.preventDefault();

      const updatedMeal = {
        nome: document.getElementById("name").value.trim(),
        prezzo: parseFloat(document.getElementById("price").value),
        descrizione: document.getElementById("description").value.trim(),
        ingredienti: document.getElementById("ingredients").value.split(",").map(i => i.trim()),
        tipologia: document.getElementById("category").value
      };

      try {
        const updateRes = await fetch(`http://localhost:3000/meals/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedMeal)
        });

        if (updateRes.ok) {
          alert("Piatto aggiornato!");
          window.location.href = "index.html";
        } else {
          alert("Errore durante il salvataggio.");
        }
      } catch (err) {
        console.error("Errore durante il salvataggio:", err);
        alert("Errore di rete.");
      }
    });
  } catch (err) {
    console.error("Errore:", err);
    alert("Errore nel caricamento.");
  }
};