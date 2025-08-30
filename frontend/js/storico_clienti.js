window.onload = async () => {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || user.role !== "cliente") {
    alert("Accesso riservato ai clienti");
    window.location.href = "login.html";
    return;
  }

  const attiviList = document.getElementById("attivi-list");
  const passatiList = document.getElementById("passati-list");

  try {
    const [ordersRes, mealsRes] = await Promise.all([
      fetch(`http://localhost:3000/orders?username=${user.username}`),
      fetch("http://localhost:3000/meals")
    ]);

    const orders = await ordersRes.json();
    const meals = (await mealsRes.json()).flatMap(r => r.menu || []);

    if (orders.length === 0) {
      attiviList.innerHTML = "<li>Nessun ordine presente.</li>";
      passatiList.innerHTML = "<li>Nessun ordine concluso.</li>";
      return;
    }

    const getPiattoNomePrezzo = id => {
      const p = meals.find(m => m.idmeals === id);
      return p ? `${p.nome} (€${p.prezzo.toFixed(2)})` : "Sconosciuto";
    };

    const attivi = orders.filter(o => o.status !== "consegnato");
    const passati = orders.filter(o => o.status === "consegnato");

    const render = (ordini, container) => {
      if (ordini.length === 0) {
        container.innerHTML = "<li>-- Nessun ordine --</li>";
        return;
      }

      container.innerHTML = ordini.map(o => `
        <li>
          <strong>ID:</strong> ${o.id}<br>
          🧾 Stato: ${o.status}<br>
          🍽️ Piatti: ${o.meals.map(getPiattoNomePrezzo).join(", ")}<br>
          📍 ${o.delivery === "domicilio" ? o.address : "Ritiro al ristorante"}
        </li>
      `).join("");
    };

    render(attivi, attiviList);
    render(passati, passatiList);

  } catch (err) {
    console.error("Errore nel caricamento:", err);
    attiviList.innerHTML = "<li>Errore durante il caricamento</li>";
    passatiList.innerHTML = "<li>Errore durante il caricamento</li>";
  }
};
