window.onload = async () => {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || user.role !== "ristoratore") {
    alert("Accesso riservato ai ristoratori.");
    window.location.href = "login.html";
    return;
  }

  const container = document.getElementById("ordine-lista");

  try {
    const [ordersRes, mealsRes] = await Promise.all([
      fetch("http://localhost:3000/orders"),
      fetch("http://localhost:3000/meals")
    ]);

    const [orders, mealsData] = await Promise.all([
      ordersRes.json(),
      mealsRes.json()
    ]);

    const mieiPiatti = mealsData.find(r => r.restaurantId === user.restaurantId)?.menu || [];

    const ordiniFiltrati = orders.filter(order =>
      order.meals.some(id => mieiPiatti.some(p => p.idmeals == id))
    );

    if (ordiniFiltrati.length === 0) {
      container.innerHTML = "<p>Nessun ordine trovato per il tuo ristorante.</p>";
      return;
    }

    container.innerHTML = "";

    for (const ordine of ordiniFiltrati) {
      const div = document.createElement("div");
      div.style.border = "1px solid #ccc";
      div.style.marginBottom = "15px";
      div.style.padding = "10px";
      div.style.borderRadius = "6px";
      div.style.backgroundColor = "#f9f9f9";

      const piatti = ordine.meals.map(id => {
        const trovato = mieiPiatti.find(p => p.idmeals == id);
        return trovato ? trovato.nome : "(piatto non tuo)";
      });

      div.innerHTML = `
        <p><strong>Cliente:</strong> ${ordine.username}</p>
        <p><strong>Stato:</strong> <span id="stato-${ordine.id}">${ordine.status}</span></p>
        <p><strong>Ritiro:</strong> ${ordine.delivery}</p>
        <p><strong>Pagamento:</strong> ${ordine.payment}</p>
        <p><strong>Piatti:</strong><br> ${piatti.map(p => `🍽️ ${p}`).join("<br>")}</p>
        ${ordine.status !== "consegnato" ? `<button onclick="aggiornaStato(${ordine.id}, '${ordine.status}')">Avanza stato</button>` : ""}
      `;

      container.appendChild(div);
    }

  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Errore nel caricamento ordini.</p>";
  }
};

// 🔄 Stato ordine: ordinato → in preparazione → consegnato
async function aggiornaStato(id, statoAttuale) {
  const next = {
    "ordinato": "in preparazione",
    "in preparazione": "consegnato"
  }[statoAttuale];

  if (!next) return;

  try {
    const res = await fetch(`http://localhost:3000/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next })
    });

    if (res.ok) {
      document.getElementById(`stato-${id}`).textContent = next;
    } else {
      alert("Errore nel cambio di stato");
    }
  } catch (err) {
    console.error(err);
    alert("Errore rete");
  }
}
