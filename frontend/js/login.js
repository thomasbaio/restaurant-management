// login.js — auto switch tra localhost e Render
const API_BASE =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://restaurant-management-wzhj.onrender.com';

console.log('API_BASE ->', API_BASE);

document.getElementById("login-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${API_BASE}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} - ${text || 'Errore durante il login'}`);
    }

    let data;
    try { data = JSON.parse(text); } catch { data = {}; }

    // Salvo utente per il frontend (username, role, restaurantId, ecc.)
    localStorage.setItem("loggedUser", JSON.stringify(data));

    alert("Login effettuato con successo!");
    window.location.href = "index.html";
  } catch (err) {
    console.error("Errore nella richiesta:", err);
    const msg = /Failed to fetch|NetworkError|CORS/i.test(String(err))
      ? "Impossibile contattare il server (controlla che l'URL non sia localhost e che CORS sia attivo)."
      : err.message;
    alert(msg);
  }
});
