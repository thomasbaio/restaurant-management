document.getElementById("payment-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const number = document.getElementById("card-number").value.trim();
  const holder = document.getElementById("card-holder").value.trim();
  const expiry = document.getElementById("expiry").value;
  const cvv = document.getElementById("cvv").value.trim();

  // ✅ Validazioni base
  if (!/^\d{16}$/.test(number)) {
    alert("Numero carta non valido (16 cifre richieste)");
    return;
  }

  if (!holder || !expiry || !/^\d{3}$/.test(cvv)) {
    alert("Compila tutti i campi correttamente.");
    return;
  }

  // ✅ Recupera ordine in sospeso
  const ordine = JSON.parse(localStorage.getItem("pendingOrder"));
  if (!ordine) {
    alert("Nessun ordine da inviare.");
    return;
  }

  try {
    // ✅ Invia ordine al backend
    const res = await fetch("http://localhost:3000/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...ordine,
        payment: "carta_credito",
        status: "ordinato"
      })
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(error);
    }

    const ordineConfermato = await res.json();

    // ✅ Salva conferma e pulisci
    localStorage.setItem("lastConfirmedOrder", JSON.stringify(ordineConfermato));
    localStorage.removeItem("pendingOrder");

    alert("Pagamento effettuato con successo!");
    window.location.href = "conferma.html";

  } catch (err) {
    console.error("Errore durante l'invio dell'ordine:", err);
    alert("Errore nel completare il pagamento. Riprova.");
  }
});
