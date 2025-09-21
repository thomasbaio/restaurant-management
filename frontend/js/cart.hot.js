// js/cart.hotfix.js
(() => {
  const CART_KEY = "cart_home_v2";

  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
    catch { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    const badge = document.getElementById("cartBadge");
    if (badge) {
      const count = cart.reduce((s, it) => s + (Number(it.qty) || 0), 0);
      badge.textContent = String(count);
    }
    console.log("[CART/HOTFIX] salvato:", cart);
  }

  function moneyToNumber(txt) {
    const n = Number(String(txt).replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  // Genera un id stabile anche se manca idmeals
  function ensureId({ id, rid, name }) {
    if (id) return String(id);
    const base = `${rid || "r"}::${name || "dish"}`;
    // hash semplice per stabilizzare
    let h = 0;
    for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
    return `gen_${h}`;
  }

  function addToCartSafe(payload) {
    const cart = readCart();
    const id = ensureId(payload);
    const idx = cart.findIndex(it => String(it.id) === String(id));
    if (idx >= 0) cart[idx].qty = (Number(cart[idx].qty) || 0) + 1;
    else {
      cart.push({
        id,
        name: String(payload.name || "Dish"),
        price: Number(payload.price) || 0,
        qty: 1,
        restaurantId: payload.rid ?? null,
        restaurantName: String(payload.rname || "")
      });
    }
    saveCart(cart);
  }

  // 1) Delegazione “universale”: cattura i click su tutta la pagina
  document.addEventListener("click", (e) => {
    const btn =
      e.target.closest("[data-add-cart]") ||         // nostro bottone previsto
      e.target.closest(".js-add-to-cart") ||         // classe alternativa
      null;

    if (!btn) return;

    e.preventDefault();

    // Prova a leggere dai dataset
    let id   = btn.dataset.id || "";
    let name = btn.dataset.name || "";
    let price = btn.dataset.price || "";
    let rid  = btn.dataset.rid || "";
    let rname = btn.dataset.rname || "";

    // Se non c'è dataset, ricava dal DOM circostante
    const card = btn.closest(".card.dish") || btn.closest("[data-dish]");
    if (!name && card) {
      const t = card.querySelector(".dish-title");
      if (t) name = t.textContent.trim();
    }
    if (!price && card) {
      const p = card.querySelector(".dish-price");
      if (p) price = moneyToNumber(p.textContent);
    }
    if (!rname) {
      // cerca l'h3 della sezione ristorante
      const section = btn.closest(".ristorante-section");
      const h3 = section ? section.querySelector(".ristorante-title") : null;
      if (h3) rname = h3.textContent.trim();
    }

    // Aggiungi
    addToCartSafe({ id, name, price, rid, rname });

    // feedback UI
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "Added!";
    setTimeout(() => { btn.disabled = false; btn.textContent = old; }, 900);
  });

  // 2) Espone funzioni per debug da console
  window.__cart = {
    read: () => readCart(),
    clear: () => { localStorage.removeItem(CART_KEY); console.log("[CART/HOTFIX] cleared"); },
    addTest: () => addToCartSafe({ name: "Test dish", price: 5, rname: "Test R" }),
  };

  // 3) Badge iniziale
  document.addEventListener("DOMContentLoaded", () => {
    saveCart(readCart());
  });
})();
