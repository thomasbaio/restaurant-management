// js/main.homepage-cart.js
(() => {
  // =========================
  // Config API base
  // =========================
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

  // =========================
  // Key carrello + helpers
  // =========================
  const CART_KEY = "cart_home_v2";

  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
    catch { return []; }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateBadge();
  }

  function updateBadge() {
    const badge = document.getElementById("cartBadge");
    if (!badge) return;
    const cart = readCart();
    const count = cart.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    badge.textContent = String(count);
  }

  function money(n) {
    const v = Number(n || 0);
    return `€${v.toFixed(2)}`;
  }

  // immagini: prende il primo campo valido
  function isValidImgPath(s) {
    if (typeof s !== "string") return false;
    const t = s.trim();
    if (!t || t === "-" || t === "#") return false;
    return /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/");
  }
  function firstImage(p) {
    const src = p || {};
    const raw = src._raw || src.raw || {};
    const candidates = [
      src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
      raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img,
    ];
    for (const u of candidates) if (isValidImgPath(u)) return u;
    return "images/placeholder.png";
  }

  // ingredienti
  function extractIngredients(p) {
    if (!p) return [];
    if (Array.isArray(p.ingredients)) return p.ingredients.filter(Boolean);
    if (Array.isArray(p.ingredienti)) return p.ingredienti.filter(Boolean);
    // fallback: TheMealDB style strIngredient1..20
    const out = [];
    for (let i = 1; i <= 20; i++) {
      const k = p[`strIngredient${i}`];
      if (k && String(k).trim()) out.push(String(k).trim());
    }
    return out;
  }

  // nome e prezzo normalizzati
  function mealName(m) {
    return m?.name ?? m?.nome ?? m?.strMeal ?? "Untitled dish";
  }
  function mealPrice(m) {
    const candidates = [m?.prezzo, m?.price, m?.cost];
    const v = candidates.find(v => v !== undefined && v !== null);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // =========================
  // Render UI
  // =========================
  const container = document.getElementById("menu-by-restaurant");
  const filterInput = document.getElementById("filter-ingredient");

  async function apiGet(path) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${API_BASE}${path}`, { signal: ctrl.signal, mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  let RAW_DATA = [];   // array ristoranti con menu
  let FLAT_MENU = [];  // tutti i piatti flat per filtro rapido

  function flattenMenu(data) {
    const out = [];
    (data || []).forEach(r => {
      const rid = r.restaurantId ?? r.id ?? r._id ?? r.legacyId ?? null;
      const rname = r.nome ?? r.name ?? r.restaurantName ?? `Restaurant ${rid ?? ""}`.trim();
      (r.menu || []).forEach(m => out.push({ r, rid, rname, m }));
    });
    return out;
  }

  function renderAll() {
    if (!container) return;
    container.innerHTML = "";
    // Raggruppa per ristorante (solo piatti che passano il filtro corrente)
    const needle = (filterInput?.value || "").trim().toLowerCase();
    const byRest = new Map();
    for (const row of FLAT_MENU) {
      const ings = extractIngredients(row.m).map(s => s.toLowerCase());
      if (needle && !ings.some(x => x.includes(needle))) continue;
      const key = row.rid ?? row.rname;
      if (!byRest.has(key)) byRest.set(key, { info: row, items: [] });
      byRest.get(key).items.push(row);
    }

    if (!byRest.size) {
      container.innerHTML = `<div class="empty">Nessun piatto trovato.</div>`;
      return;
    }

    for (const { info, items } of byRest.values()) {
      const rname = info.rname;
      const section = document.createElement("div");
      section.className = "ristorante-section";
      section.innerHTML = `<h3 class="ristorante-title">${rname}</h3>
        <div class="cards"></div>`;
      const grid = section.querySelector(".cards");

      items.forEach(({ rid, rname, m }) => {
        const id = m.idmeals ?? m.id ?? m._id;
        const name = mealName(m);
        const price = mealPrice(m);
        const img = firstImage(m);
        const ings = extractIngredients(m);

        const card = document.createElement("article");
        card.className = "card dish";
        card.innerHTML = `
          <img class="dish-img" alt="${name}" src="${img}">
          <div class="dish-body">
            <div class="dish-title">${name}</div>
            <div class="dish-ings">${ings.map(x => `<span class="chip">${x}</span>`).join(" ") || "<em>No ingredients</em>"}</div>
            <div class="dish-foot">
              <span class="dish-price">${money(price)}</span>
              <button class="btn primary" data-add-cart 
                data-id="${id}" 
                data-name="${encodeURIComponent(name)}"
                data-price="${price}"
                data-rid="${rid}"
                data-rname="${encodeURIComponent(rname)}">Add to cart</button>
            </div>
          </div>`;
        grid.appendChild(card);
      });

      container.appendChild(section);
    }
  }

  // =========================
  // Add to cart
  // =========================
  function addToCart({ id, name, price, rid, rname }) {
    name = decodeURIComponent(name || "");
    rname = decodeURIComponent(rname || "");
    const cart = readCart();
    const idx = cart.findIndex(it => String(it.id) === String(id));
    if (idx >= 0) cart[idx].qty = (Number(cart[idx].qty) || 0) + 1;
    else cart.push({ id, name, price: Number(price) || 0, qty: 1, restaurantId: rid ?? null, restaurantName: rname || "" });
    saveCart(cart);
  }

  // delega click sui pulsanti
  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-add-cart]");
      if (!btn) return;
      const payload = {
        id: btn.getAttribute("data-id"),
        name: btn.getAttribute("data-name"),
        price: btn.getAttribute("data-price"),
        rid: btn.getAttribute("data-rid"),
        rname: btn.getAttribute("data-rname"),
      };
      addToCart(payload);
      // feedback veloce
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Added!";
      setTimeout(() => { btn.disabled = false; btn.textContent = old; }, 900);
    });
  }

  // =========================
  // Filtro ingredienti
  // =========================
  if (filterInput) {
    filterInput.addEventListener("input", () => renderAll());
  }

  // =========================
  // Boot
  // =========================
  async function boot() {
    updateBadge();
    try {
      RAW_DATA = await apiGet("/meals"); // array di ristoranti con menu
      FLAT_MENU = flattenMenu(RAW_DATA);
      renderAll();
    } catch (err) {
      console.error(err);
      if (container) container.innerHTML = `<div class="error">Errore nel caricare i piatti.</div>`;
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
