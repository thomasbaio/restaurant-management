// login.js (FRONTEND) — tenta /login poi /users/login, salva token e user
(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal
    ? "http://localhost:3000"
    : "https://restaurant-management-wzhj.onrender.com";

  const form = document.getElementById("login-form");
  if (!form) return;

  async function postJson(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data || {};
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const emailEl = document.getElementById("email");
    const userEl  = document.getElementById("username");
    const passEl  = document.getElementById("password");

    const rawEmail = (emailEl?.value || "").trim();
    const rawUser  = (userEl?.value || "").trim();
    const password = (passEl?.value || "").trim();

    if (!(rawEmail || rawUser) || !password) {
      alert("Inserisci email o username e la password.");
      return;
    }

    // se l'utente mette un'email nel campo username, usiamola come email
    const payload = {};
    if (rawEmail) payload.email = rawEmail;
    else if (rawUser.includes("@")) payload.email = rawUser;
    else payload.username = rawUser;
    payload.password = password;

    try {
      // tenta /login, se 404 passa a /users/login
      let data;
      try {
        data = await postJson(`${API_BASE}/login`, payload);
      } catch (e1) {
        if (!/HTTP 404/.test(String(e1.message))) throw e1;
        data = await postJson(`${API_BASE}/users/login`, payload);
      }

      const user = data.user || data.data?.user || null;
      if (!user) throw new Error("Risposta non valida dal server (utente mancante).");

      // salva token (se presente) e utente "safe"
      if (data.token) localStorage.setItem("authToken", data.token);
      const safeUser = {
        id: user._id || user.id || user.legacyId || null,
        username: user.username || "",
        email: user.email || "",
        role: user.role || "",
        restaurantId: user.restaurantId || user.r_o || "",
      };
      localStorage.setItem("loggedUser", JSON.stringify(safeUser));

      alert("Login effettuato!");
      window.location.href = "index.html";
    } catch (err) {
      console.error("[LOGIN]", err);
      const isNetwork = /Failed to fetch|NetworkError|CORS/i.test(String(err));
      alert(isNetwork
        ? "Impossibile contattare il server. Controlla URL/connessione."
        : `Login fallito: ${err.message}`);
    }
  });
})();
