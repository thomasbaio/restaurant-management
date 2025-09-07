// scegli base URL: localhost in dev, Render in produzione
const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://restaurant-management-wzhj.onrender.com";

console.log("API_BASE ->", API_BASE);

// --- cache elementi
const form = document.getElementById("register-form");
const roleEl = document.getElementById("role");

const extraCliente = document.getElementById("cliente-extra");
const extraRist    = document.getElementById("ristoratore-extra");

// campi base
const usernameEl = document.getElementById("username");
const emailEl    = document.getElementById("email");
const passEl     = document.getElementById("password");

// cliente
const preferenzaEl = document.getElementById("preferenza");

// ristoratore
const pivaEl  = document.getElementById("piva");
const telEl   = document.getElementById("telefono");
const luogoEl = document.getElementById("luogo");
const viaEl   = document.getElementById("via");
const rnameEl = document.getElementById("restaurantName");

// --- UI: mostra/nasconde e required dinamici
function refreshRoleUI() {
  const role = roleEl.value;
  const isCliente = role === "cliente";
  const isRisto   = role === "ristoratore";

  extraCliente.style.display = isCliente ? "block" : "none";
  extraRist.style.display    = isRisto   ? "block" : "none";

  // required dinamici
  // preferenza è opzionale lato business
  preferenzaEl.required = false;

  rnameEl.required = isRisto;
  pivaEl.required  = isRisto;
  telEl.required   = isRisto;
  luogoEl.required = isRisto;
  viaEl.required   = isRisto;
}

roleEl.addEventListener("change", refreshRoleUI);
// inizializza allo stato corretto
refreshRoleUI();

// --- validazione base
function validateForm() {
  const username = usernameEl.value.trim();
  const email = emailEl.value.trim();
  const pwd = passEl.value;

  if (!username) return "Username is required.";
  if (!email) return "Email is required.";
  if (!pwd || pwd.length < 6) return "Password must be at least 6 characters.";

  if (roleEl.value === "ristoratore") {
    // opzionale: richiedi almeno restaurantName e telefono
    if (!rnameEl.value.trim()) return "Restaurant name is required for restaurants.";
    if (!telEl.value.trim()) return "Phone number is required for restaurants.";
  }
  return null;
}

// --- submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const err = validateForm();
  if (err) {
    alert(err);
    return;
  }

  const role = roleEl.value;
  const payload = {
    username: usernameEl.value.trim(),
    email: emailEl.value.trim(),
    password: passEl.value,
    role
  };

  if (role === "cliente") {
    const pref = (preferenzaEl.value || "").trim();
    if (pref) payload.preferenza = pref; // << inviamo la preferenza
  } else {
    payload.partitaIva    = pivaEl.value.trim();
    payload.telefono      = telEl.value.trim();
    payload.luogo         = luogoEl.value.trim();
    payload.indirizzo     = viaEl.value.trim();
    payload.restaurantName = rnameEl.value.trim();
    // Se vuoi imporre un restaurantId fisso, decommenta:
    // payload.restaurantId = "r_o";
  }

  // disabilita submit durante la richiesta
  const submitBtn = form.querySelector('button[type="submit"]');
  const prevTxt = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Registering...";

  try {
    const res = await fetch(`${API_BASE}/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} – ${txt || "Registration failed"}`);
    }

    const data = await res.json();
    console.log("Registration OK:", data);
    alert("Registration completed! Now you can log in.");
    window.location.href = "login.html";
  } catch (e2) {
    console.error("Request error:", e2);
    alert(`Registration error.\n${e2.message || e2}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = prevTxt;
  }
});
