// login.js — Frontend robusto: prova prima /users/login, poi /login.
// Mostra corpo errore se il server non restituisce JSON valido o manca "user".
(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal
    ? "http://localhost:3000"
    : "https://restaurant-management-wzhj.onrender.com";

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
      const err = new Error(msg);
      err.status = res.status;
      err.statusText = res.statusText;
      err.body = text;
      throw err;
    }
    return { data, raw: text };
  }

  function pickUser(obj) {
    if (!obj) return null;
    // accetta vari layout
    if (obj.user) return obj.user;
    if (obj.data && obj.data.user) return obj.data.user;
    // alcuni backend rispondono direttamente con l'utente
    if (obj.username || obj.email || obj.role) return obj;
    return null;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form    = document.getElementById("login-form");
    const emailEl = document.getElementById("email");     // opzionale
    const userEl  = document.getElementById("username");  // può contenere username o email
    const passEl  = document.getElementById("password");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const rawEmail = (emailEl?.value || "").trim();
      const rawUser  = (userEl?.value  || "").trim();
      const password = (passEl?.value  || "").trim();

      if (!(rawEmail || rawUser) || !password) {
        alert("Inserisci email o username e la password.");
        return;
      }

      const payload = {};
      if (rawEmail) payload.email = rawEmail;
      else if (rawUser.includes("@")) payload.email = rawUser;
      else payload.username = rawUser;
      payload.password = password;

      try {
        let resp, data, user;

        // 1) prova /users/login (il tuo prod non ha /login)
        try {
          resp = await postJson(`${API_BASE}/users/login`, payload);
        } catch (e1) {
          // 2) fallback /login solo se 404 o 405
          if (!(e1.status === 404 || e1.status === 405)) throw e1;
          resp = await postJson(`${API_BASE}/login`, payload);
        }

        data = resp.data ?? null;

        // se il server ha risposto HTML, fallisci con dettaglio
        if (!data && resp.raw && /^\s*<!DOCTYPE html>/i.test(resp.raw)) {
          throw new Error("Il server ha risposto HTML invece di JSON:\n" + resp.raw.slice(0, 200));
        }

        user = pickUser(data);
        if (!user) {
          // mostra anche il JSON grezzo che è arrivato per debug
          throw new Error(
            "Risposta non valida dal server (utente mancante). Corpo: " +
            (resp.raw ? resp.raw.slice(0, 300) : JSON.stringify(data))
          );
        }

        // salva token (se presente) e utente “safe”
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
  });
})();
