// cart.js — pagina carrello (qty +/- , rimuovi singolo, svuota tutto, badge in sync)

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;
const CART_KEY = "cart_home_v2";

const money = n => `€${Number(n || 0).toFixed(2)}`;

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
  catch { return []; }
}
function writeCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateBadge(cart);
}

function updateBadge(cart = readCart()) {
  const b = document.getElementById("cartBadge");
  if (!b) return;
  const totQty = cart.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  b.textContent = String(totQty);
}

// parser robusto per stringhe-prezzo: "€10", "10,00", "1.234,56", "EUR 12.5", ecc.
function parsePriceLike(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;

  let s = v.trim();
  if (!s) return NaN;

  // tieni solo cifre, virgole, punti e segno
  s = s.replace(/[^\d.,-]/g, "");

  const hasComma = s.includes(",");
  const hasDot   = s.includes(".");

  if (hasComma && hasDot) {
    // "1.234,56" -> "1234,56" -> "1234.56"
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    // "10,50" -> "10.50"
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function sanitizeCart(cart) {
  // qty >=1; price numerico (interpretando eventuali stringhe)
  return (cart || []).map(it => {
    const parsed = parsePriceLike(it.price);
    return {
      ...it,
      qty: Math.max(1, Number(it.qty || 0)),
      price: Number.isFinite(parsed) ? parsed : 0
    };
  });
}

function renderCart() {
  const list = document.getElementById("cartList");
  const totalEl = document.getElementById("cartTotal");
  if (!list || !totalEl) return;

  let cart = sanitizeCart(readCart());
  writeCart(cart); // assicura badge + tipi coerenti

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
    const lineTot = Number(it.price) * Number(it.qty);
    tot += lineTot;

    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <img class="cart-img" alt="" src="${it.image || "images/placeholder-dish.jpg"}"
           onerror="this.src='images/placeholder-dish.jpg'">
      <div>
        <div class="cart-name">${it.name || "Piatto"}</div>
        <div class="cart-meta">
          ${it.category ? (it.category + " — ") : ""}${it.restaurantName || ""}
        </div>
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
      it.qty = (Number(it.qty) || 0) + 1;
      writeCart(cart);
      renderCart();
    };
    row.querySelector("[data-dec]").onclick = () => {
      it.qty = Math.max(1, (Number(it.qty) || 0) - 1);
      writeCart(cart);
      renderCart();
    };

    // rimuovi singolo
    row.querySelector("[data-remove]").onclick = () => {
      cart = readCart().filter(x => String(x.id) !== String(it.id));
      writeCart(cart);
      renderCart();
    };

    list.appendChild(row);
  }

  totalEl.textContent = money(tot);
}

async function checkout() {
  const cart = sanitizeCart(readCart());
  if (!cart.length) return alert("Il carrello è vuoto.");

  const payload = {
    items: cart.map(({ id, name, price, qty, restaurantId, restaurantName /*, image, category */ }) =>
      ({ id, name, price, qty, restaurantId, restaurantName /*, image, category */ })
    ),
    total: cart.reduce((s, it) => s + (Number(it.price) * Number(it.qty)), 0),
    when: new Date().toISOString(),
    source: "cart-page"
  };

  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  const clearBtn = document.getElementById("clearCart");
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm("Svuotare tutto il carrello?")) {
        writeCart([]);
        renderCart();
      }
    };
  }
  const checkoutBtn = document.getElementById("checkout");
  if (checkoutBtn) checkoutBtn.onclick = checkout;

  renderCart();
  updateBadge();

  // se la Home aggiunge articoli mentre questa pagina è aperta
  window.addEventListener("storage", (ev) => {
    if (ev.key === CART_KEY) renderCart();
  });
});

