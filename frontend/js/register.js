// =============== Config base URL (localhost / prod / file) ===============
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const isFile  = location.protocol === "file:";
const PROD    = "https://restaurant-management-wzhj.onrender.com";

const API_BASE = isLocal ? "http://localhost:3000" 
               : isFile  ? PROD 
               : location.origin;

console.log("[register] API_BASE:", API_BASE);

// =============== Cache elementi ===============
const form   = document.getElementById("register-form");
const roleEl = document.getElementById("role");

const extraCliente = document.getElementById("cliente-extra");
const extraRist    = document.getElementById("ristoratore-extra");

const usernameEl = document.getElementById("username");
const emailEl    = document.getElementById("email");
const passEl     = document.getElementById("password");
const preferenzaEl = document.getElementById("preferenza");

// ristoratore
const pivaEl  = document.getElementById("piva");
const telEl   = document.getElementById("telefono");
const luogoEl = document.getElementById("luogo");
const viaEl   = document.getElementById("via");
const rnameEl = document.getElementById("restaurantName");

// =============== UI dinamica per ruoli ===============
function refreshRoleUI() {
  const role = roleEl?.value;
  const isCliente = role === "cliente";
  const isRisto   = role === "ristoratore";

  if (extraCliente) extraCliente.style.display = isCliente ? "block" : "none";
  if (extraRist)    extraRist.style.display    = isRisto   ? "block" : "none";

  if (preferenzaEl) preferenzaEl.required = false;

  [rnameEl, pivaEl, telEl, luogoEl, viaEl].forEach(el => {
    if (el) el.required = !!isRisto;
  });
}

roleEl?.addEventListener("change", refreshRoleUI);
refreshRoleUI();

// =============== Validazione minima ===============
function validateForm() {
  if (!usernameEl?.value.trim()) return "Username obbligatorio.";
  if (!emailEl?.value.trim())    return "Email obbligatoria.";
  if (!passEl?.value || passEl.value.length < 6) return "Password di almeno 6 caratteri.";

  if (roleEl?.value === "ristoratore") {
    if (!rnameEl?.value.trim()) return "Nome ristorante obbligatorio.";
    if (!telEl?.value.trim())   return "Telefono obbligatorio.";
  }
  return null;
}

// =============== Helper fetch con timeout ===============
async function apiPost(path, data, { timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: ctrl.signal,
      mode: "cors"
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} – ${txt || "Errore"}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// =============== Submit form ===============
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!navigator.onLine) {
    alert("Sei offline. Connettiti a Internet e riprova.");
    return;
  }

  const err = validateForm();
  if (err) { alert(err); return; }

  const role = roleEl?.value || "cliente";
  const payload = {
    username: usernameEl.value.trim(),
    email:    emailEl.value.trim(),
    password: passEl.value,
    role
  };

  if (role === "cliente") {
    const pref = (preferenzaEl?.value || "").trim();
    if (pref) payload.preferenza = pref;
  } else {
    payload.partitaIva     = pivaEl?.value?.trim()   || "";
    payload.telefono       = telEl?.value?.trim()    || "";
    payload.luogo          = luogoEl?.value?.trim()  || "";
    payload.indirizzo      = viaEl?.value?.trim()    || "";
    payload.restaurantName = rnameEl?.value?.trim()  || "";
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const prevTxt = submitBtn?.textContent;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Registrazione…"; }

  try {
    const data = await apiPost("/users/register", payload);
    console.log("Registrazione OK:", data);
    alert("Registrazione completata! Ora puoi accedere.");
    window.location.href = "login.html";
  } catch (err2) {
    console.error("Errore richiesta:", err2);
    alert(`Errore di registrazione:\n${err2.message || err2}`);
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prevTxt; }
  }
});
