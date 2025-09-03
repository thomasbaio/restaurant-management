// register.js (FRONTEND) — fix URL + mapping campi

// Scegli base URL: localhost in dev, Render in produzione
const API_BASE =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://restaurant-management-wzhj.onrender.com';

console.log('API_BASE ->', API_BASE);

// Toggle blocchi extra in base al ruolo
document.getElementById('role').addEventListener('change', function () {
  const extraRist = document.getElementById('ristoratore-extra');
  const extraCliente = document.getElementById('cliente-extra');
  extraRist.style.display = this.value === 'ristoratore' ? 'block' : 'none';
  extraCliente.style.display = this.value === 'cliente' ? 'block' : 'none';
});

document.getElementById('register-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const role = document.getElementById('role').value;

  // payload base
  const payload = {
    username: document.getElementById('username').value.trim(),
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value,
    role
  };

  // 🔁 Mappa i nomi campo del form a quelli attesi dal backend
  if (role === 'ristoratore') {
    payload.partitaIva = document.getElementById('piva')?.value?.trim() || '';
    payload.telefono   = document.getElementById('telefono')?.value?.trim() || '';
    payload.luogo      = document.getElementById('luogo')?.value?.trim() || '';
    payload.indirizzo  = document.getElementById('via')?.value?.trim() || '';
    payload.restaurantName = document.getElementById('restaurantName')?.value?.trim() || '';
    // Se hai già un restaurantId preassegnato, puoi anche inviarlo:
    // payload.restaurantId = 'r_o';
  } else {
    // Campi cliente – opzionali lato backend attuale (non usati dalla rotta /register MongoDB)
    // Li teniamo fuori dal payload finché la rotta non li supporta.
    // const nome = document.getElementById('nome')?.value?.trim() || '';
    // const cognome = document.getElementById('cognome')?.value?.trim() || '';
    // const pagamento = document.getElementById('pagamento')?.value || '';
    // const preferenza = document.getElementById('preferenza')?.value || '';
  }

  try {
    const res = await fetch(`${API_BASE}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status} - ${txt}`);
    }

    const data = await res.json();
    console.log('Registrazione OK:', data);
    alert('Registrazione completata!');
    window.location.href = 'login.html';
  } catch (err) {
    console.error('Errore nella richiesta:', err);
    alert('Errore nella registrazione. Controlla la console.');
  }
});
