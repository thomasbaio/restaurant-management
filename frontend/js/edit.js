const params = new URLSearchParams(window.location.search);
const id = parseInt(params.get("id"));

if (!id || isNaN(id)) {
  alert("ID piatto non valido.");
  window.location.href = "index.html";
}

window.onload = async () => {
  try {
    // 📌 Recupera tutti i ristoranti e i loro piatti
    const res = await fetch("http://localhost:3000/meals");
    if (!res.ok) throw new Error("Errore nella risposta del server");
    const restaurants = await res.json();

    // 📌 Cerca il piatto da modificare
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
      window.location.href = "index.html";
      return;
    }

    // 📌 Popola il form
    document.getElementById("name").value = foundMeal.nome ?? "";
    document.getElementById("price").value = foundMeal.prezzo ?? "";
    document.getElementById("description").value = foundMeal.descrizione ?? "";
    document.getElementById("ingredients").value = Array.isArray(foundMeal.ingredienti)
      ? foundMeal.ingredienti.join(", ")
      : "";
    document.getElementById("category").value = foundMeal.tipologia ?? "";

    // 📌 Gestione submit
    document.getElementById("edit-form").addEventListener("submit", async (e) => {
      e.preventDefault();

      const updatedMeal = {
        nome: document.getElementById("name").value.trim(),
        prezzo: parseFloat(document.getElementById("price").value) || 0,
        descrizione: document.getElementById("description").value.trim(),
        ingredienti: document.getElementById("ingredients").value
          .split(",")
          .map(i => i.trim())
          .filter(i => i.length > 0),
        tipologia: document.getElementById("category").value.trim()
      };

      try {
        const updateRes = await fetch(`http://localhost:3000/meals/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedMeal)
        });

        if (updateRes.ok) {
          alert("✅ Piatto aggiornato!");
          window.location.href = "index.html";
        } else {
          const errText = await updateRes.text();
          alert("Errore durante il salvataggio: " + errText);
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
