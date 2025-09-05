// 📌 Imposta l'endpoint (funziona sia in locale che su Render)
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

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

  if (!holder) {
    alert("Inserisci l'intestatario della carta.");
    return;
  }

  // ✅ Controllo scadenza (MM/YY o YYYY-MM da <input type="month">)
  if (!expiry) {
    alert("Inserisci la data di scadenza.");
    return;
  } else {
    const oggi = new Date();
    const expDate = new Date(expiry);
    if (expDate < oggi) {
      alert("La carta è scaduta.");
      return;
    }
  }

  if (!/^\d{3}$/.test(cvv)) {
    alert("CVV non valido (3 cifre richieste).");
    return;
  }

  // ✅ Recupera ordine in sospeso
  const ordine = JSON.parse(localStorage.getItem("pendingOrder"));
  if (!ordine) {
    alert("Nessun ordine in sospeso da pagare.");
    return;
  }

  try {
    // ✅ Invia ordine al backend
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...ordine,
        payment: "carta_credito",
        status: "ordinato"
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || "Errore generico dal server");
    }

    const ordineConfermato = await res.json();

    // ✅ Salva conferma e pulisci
    localStorage.setItem("lastConfirmedOrder", JSON.stringify(ordineConfermato));
    localStorage.removeItem("pendingOrder");

    alert("✅ Pagamento effettuato con successo!");
    window.location.href = "conferma.html";

  } catch (err) {
    console.error("Errore durante l'invio dell'ordine:", err);
    alert("❌ Errore nel completare il pagamento. Riprova più tardi.");
  }
});
