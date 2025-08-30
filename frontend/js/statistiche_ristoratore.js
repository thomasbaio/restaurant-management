window.onload = async () => {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || user.role !== "ristoratore") {
    alert("Accesso riservato ai ristoratori");
    window.location.href = "login.html";
    return;
  }

  const totOrdini = document.getElementById("tot-ordini");
  const totPiatti = document.getElementById("tot-piatti");
  const totIncasso = document.getElementById("tot-incasso");
  const piattiPopolari = document.getElementById("piatti-popolari");

  try {
    const [ordersRes, mealsRes] = await Promise.all([
      fetch("http://localhost:3000/orders"),
      fetch("http://localhost:3000/meals")
    ]);

    const allOrders = await ordersRes.json();
    const allMeals = await mealsRes.json();

    const mieiPiatti = (allMeals.find(r => r.restaurantId === user.restaurantId)?.menu) || [];
    const mieiPiattiMap = new Map(mieiPiatti.map(p => [p.idmeals, p]));

    const ordiniDelMioRistorante = allOrders.filter(o =>
      o.meals.some(id => mieiPiattiMap.has(id))
    );

    const piattiVenduti = {};
    let totalePiatti = 0;
    let totaleIncasso = 0;

    ordiniDelMioRistorante.forEach(ordine => {
      ordine.meals.forEach(id => {
        if (mieiPiattiMap.has(id)) {
          const piatto = mieiPiattiMap.get(id);
          totalePiatti++;
          totaleIncasso += piatto.prezzo;
          piattiVenduti[piatto.nome] = (piattiVenduti[piatto.nome] || 0) + 1;
        }
      });
    });

    // Riempimento DOM
    totOrdini.textContent = ordiniDelMioRistorante.length;
    totPiatti.textContent = totalePiatti;
    totIncasso.textContent = `€${totaleIncasso.toFixed(2)}`;

    const topPiatti = Object.entries(piattiVenduti)
      .sort((a, b) => b[1] - a[1])
      .map(([nome, count]) => `<li>${nome} - ${count}x</li>`);

    piattiPopolari.innerHTML = topPiatti.join("") || "<li>Nessun ordine ricevuto.</li>";

  } catch (err) {
    console.error("Errore caricamento statistiche:", err);
    totOrdini.textContent = totPiatti.textContent = totIncasso.textContent = "Errore";
    piattiPopolari.innerHTML = "<li>⚠️ Errore nel caricamento.</li>";
  }
};
