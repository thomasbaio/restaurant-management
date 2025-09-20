// cart.js — pagina carrello (rimozione singolo con 'x' e svuota tutto)

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;
const CART_KEY = "cart_home_v2";

const money = n => `€${Number(n || 0).toFixed(2)}`;

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
}
function writeCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function renderCart() {
  const list = document.getElementById("cartList");
  const totalEl = document.getElementById("cartTotal");
  const cart = readCart();

  list.innerHTML = "";
  let tot = 0;

  if (!cart.length) {
    list.innerHTML = `
      <div class="empty">
        Il carrello è vuoto. <a href="index.html">Vai alla Home</a> per aggiungere piatti.
      </div>`;
    totalEl.textContent = money(0);
    return;
  }

  for (const it of cart) {
    const lineTot = Number(it.price || 0) * Number(it.qty || 0);
    tot += lineTot;

    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <img class="cart-img" alt="" src="${it.image || "images/placeholder-dish.jpg"}" onerror="this.src='images/placeholder-dish.jpg'">
      <div>
        <div class="cart-name">${it.name || "Piatto"}</div>
        <div class="cart-meta">${it.restaurantName || ""}</div>
      </div>

      <div class="cart-qty">
        <button data-dec title="Diminuisci">−</button>
        <div>${Number(it.qty || 0)}</div>
        <button data-inc title="Aumenta">+</button>
      </div>

      <div class="cart-price">${money(it.price)}</div>
      <div class="cart-line-total">${money(lineTot)}</div>

      <button class="remove-line" aria-label="Rimuovi riga" title="Rimuovi riga" data-remove>×</button>
    `;

    // qty +/-
    row.querySelector("[data-inc]").onclick = () => {
      it.qty = Number(it.qty || 0) + 1;
      writeCart(cart);
      renderCart();
    };
    row.querySelector("[data-dec]").onclick = () => {
      it.qty = Math.max(1, Number(it.qty || 0) - 1);
      writeCart(cart);
      renderCart();
    };
    // rimuovi singolo
    row.querySelector("[data-remove]").onclick = () => {
      const newCart = readCart().filter(x => x.id !== it.id);
      writeCart(newCart);
      renderCart();
    };

    list.appendChild(row);
  }

  totalEl.textContent = money(tot);
}

async function checkout() {
  const cart = readCart();
  if (!cart.length) return alert("Il carrello è vuoto.");
  const payload = {
    items: cart.map(({id,name,price,qty,restaurantId,restaurantName}) => ({ id, name, price, qty, restaurantId, restaurantName })),
    total: cart.reduce((s,it)=>s + (Number(it.price||0) * Number(it.qty||0)), 0),
    when: new Date().toISOString(),
    source: "cart-page"
  };
  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload),
      mode: "cors"
    });
    if (res.ok) {
      alert("Ordine inviato! Puoi vedere i dettagli nella pagina Ordini.");
      writeCart([]);
      renderCart();
      return;
    }
  } catch (_) {}
  localStorage.setItem("lastOrder", JSON.stringify(payload));
  alert("Carrello salvato. Il server ordini non è disponibile: riprova più tardi.");
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("clearCart").onclick = () => {
    if (confirm("Svuotare tutto il carrello?")) {
      writeCart([]);
      renderCart();
    }
  };
  document.getElementById("checkout").onclick = checkout;
  renderCart();
});
