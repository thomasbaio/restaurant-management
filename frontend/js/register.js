// scegli base URL: localhost in dev, Render in produzione
const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://restaurant-management-wzhj.onrender.com";

console.log("API_BASE ->", API_BASE);

// --- cache elementi (possono essere null se non presenti in pagina)
const form   = document.getElementById("register-form");
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

// --- UI: mostra/nasconde e required dinamici (tutto con guardie)
function refreshRoleUI() {
  const role = roleEl?.value;
  const isCliente = role === "cliente";
  const isRisto   = role === "ristoratore";

  if (extraCliente) extraCliente.style.display = isCliente ? "block" : "none";
  if (extraRist)    extraRist.style.display    = isRisto   ? "block" : "none";

  // required dinamici solo se il campo esiste
  if (preferenzaEl) preferenzaEl.required = false; // è opzionale

  [rnameEl, pivaEl, telEl, luogoEl, viaEl].forEach(el => {
    if (el) el.required = !!isRisto;
  });
}

// inizializza allo stato corretto e su cambio ruolo
if (roleEl) roleEl.addEventListener("change", refreshRoleUI);
refreshRoleUI();

// --- validazione base (solo su campi presenti)
function validateForm() {
  const username = usernameEl?.value?.trim();
  const email = emailEl?.value?.trim();
  const pwd = passEl?.value || "";

  if (!username) return "Username is required.";
  if (!email)    return "Email is required.";
  if (pwd.length < 6) return "Password must be at least 6 characters.";

  if (roleEl?.value === "ristoratore") {
    if (rnameEl && !rnameEl.value.trim()) return "Restaurant name is required for restaurants.";
    if (telEl && !telEl.value.trim())     return "Phone number is required for restaurants.";
  }
  return null;
}

// --- submit
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const err = validateForm();
  if (err) {
    alert(err);
    return;
  }

  const role = roleEl?.value || "cliente";
  const payload = {
    username: usernameEl?.value?.trim(),
    email:    emailEl?.value?.trim(),
    password: passEl?.value,
    role
  };

  if (role === "cliente") {
    const pref = (preferenzaEl?.value || "").trim();
    if (pref) payload.preferenza = pref; // inviamo la preferenza
  } else {
    payload.partitaIva     = pivaEl?.value?.trim()   || "";
    payload.telefono       = telEl?.value?.trim()    || "";
    payload.luogo          = luogoEl?.value?.trim()  || "";
    payload.indirizzo      = viaEl?.value?.trim()    || "";
    payload.restaurantName = rnameEl?.value?.trim()  || "";
    // payload.restaurantId = "r_o"; // opzionale
  }

  // disabilita submit durante la richiesta
  const submitBtn = form.querySelector('button[type="submit"]');
  const prevTxt = submitBtn ? submitBtn.textContent : null;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Registering..."; }

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
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prevTxt; }
  }
});
