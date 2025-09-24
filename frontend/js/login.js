// login.js (FRONTEND) — invia email/username + password e salva data.user

(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal
    ? "http://localhost:3000"
    : "https://restaurant-management-wzhj.onrender.com";

  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emailEl = document.getElementById("email");
    const userEl  = document.getElementById("username");
    const passEl  = document.getElementById("password");

    const email = (emailEl?.value || "").trim();
    const username = (userEl?.value || "").trim();
    const password = (passEl?.value || "").trim();

    if ((!email && !username) || !password) {
      alert("Inserisci email o username e la password.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "cors",
        body: JSON.stringify({
          // invia entrambi; il backend userà quello presente
          email: email || undefined,
          username: username || undefined,
          password
        })
      });

      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = {}; }

      if (!res.ok) {
        // mostra messaggio dettagliato dal server se disponibile
        const msg = (data && data.message) ? data.message : (text || `HTTP ${res.status}`);
        throw new Error(msg);
      }

      if (!data || !data.user) {
        throw new Error("Risposta non valida dal server (utente mancante).");
      }

      // ✅ salva SOLO i dati utente
      localStorage.setItem("loggedUser", JSON.stringify(data.user));

      alert("Login effettuato!");
      window.location.href = "index.html";
    } catch (err) {
      console.error("Login error:", err);
      const isNetwork = /Failed to fetch|NetworkError|CORS/i.test(String(err));
      alert(isNetwork
        ? "Impossibile contattare il server. Controlla URL/connessione."
        : `Credenziali non valide: ${err.message}`);
    }
  });
})();
