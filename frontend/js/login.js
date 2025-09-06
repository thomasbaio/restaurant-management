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
      throw new Error(`HTTP ${res.status} - ${text || 'Login error'}`);
    }

    let data;
    try { data = JSON.parse(text); } catch { data = {}; }

    // Sslvo utente per il frontend (username, role, restaurantId, ecc.)
    localStorage.setItem("loggedUser", JSON.stringify(data));

    alert("Login successful!");
    window.location.href = "index.html";
  } catch (err) {
    console.error("Request error:", err);
    const msg = /Failed to fetch|NetworkError|CORS/i.test(String(err))
      ? "Unable to contact the server (check that the URL isn't localhost and that CORS is enabled)."
      : err.message;
    alert(msg);
  }
});

