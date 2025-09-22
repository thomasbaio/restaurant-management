(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

  const CART_KEY = "cart_home_v2";

  /* ============ helpers cart ============ */
  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
    catch { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateBadge();
    console.log("[CART] salvato:", cart);
  }
  function updateBadge() {
    const badge = document.getElementById("cartBadge");
    if (!badge) return;
    const cart = readCart();
    const count = cart.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    badge.textContent = String(count);
  }
  const money = (n) => `€${Number(n || 0).toFixed(2)}`;
  const parseMoney = (txt) => {
    const n = Number(String(txt).replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  /* ============ pricing & fields ============ */
  const PRICE_BY_CATEGORY = {
    Dessert: 4.5, Breakfast: 5.0, Starter: 6.0, Side: 4.0, Miscellaneous: 7.0,
    Vegetarian: 8.0, Vegan: 8.5, Pasta: 9.5, Chicken: 10.5, Pork: 11.0,
    Beef: 12.0, Lamb: 13.0, Seafood: 14.0
  };
  const fallbackPrice = (cat) => {
    if (!cat) return 8.9;
    const key = String(cat).toLowerCase();
    const hit = Object.keys(PRICE_BY_CATEGORY).find(k => k.toLowerCase() === key);
    return hit ? PRICE_BY_CATEGORY[hit] : 8.9;
  };

  function mealCategory(m)   { return m?.tipologia ?? m?.category ?? m?.strCategory ?? ""; }
  function mealName(m)       { return m?.name ?? m?.nome ?? m?.strMeal ?? "Dish"; }
  function mealPrice(m) {
    const v = [m?.prezzo, m?.price, m?.cost, m?.strPrice].find(x => x != null);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function isValidImgPath(s) {
    if (typeof s !== "string") return false;
    const t = s.trim();
    if (!t || t === "-" || t === "#") return false;
    return /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/");
  }
  function firstImage(p) {
    const src = p || {}, raw = src._raw || src.raw || {};
    const candidates = [
      src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
      raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img,
    ];
    for (const u of candidates) if (isValidImgPath(u)) return u;
    return "images/placeholder.png";
  }
  function extractIngredients(p) {
    if (!p) return [];
    if (Array.isArray(p.ingredients)) return p.ingredients.filter(Boolean);
    if (Array.isArray(p.ingredienti)) return p.ingredienti.filter(Boolean);
    const out = [];
    for (let i = 1; i <= 20; i++) {
      const k = p[`strIngredient${i}`];
      if (k && String(k).trim()) out.push(String(k).trim());
    }
    return out;
  }

  /* ============ state ============ */
  const container = document.getElementById("menu-by-restaurant");
  const filterInput = document.getElementById("filter-ingredient");
  let RAW = [];
  let FLAT = [];
  const MAP = new Map(); // key -> normalized item for cart

  async function apiGet(path) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${API_BASE}${path}`, { signal: ctrl.signal, mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  function flatten(data) {
    const out = [];
    (data || []).forEach(r => {
      const rid = r.restaurantId ?? r.id ?? r._id ?? r.legacyId ?? null;
      const rname = r.nome ?? r.name ?? r.restaurantName ?? `Restaurant ${rid ?? ""}`.trim();
      (r.menu || []).forEach(m => out.push({ r, rid, rname, m }));
    });
    return out;
  }

  /* ============ render ============ */
  function makeAddBtn(key) {
    const btn = document.createElement("button");
    btn.className = "btn primary add-to-cart";
    btn.type = "button";
    btn.textContent = "Add to cart";
    btn.dataset.key = key;
    return btn;
  }

  function render() {
    if (!container) return;
    container.innerHTML = "";

    const needle = (filterInput?.value || "").trim().toLowerCase();
    const byRest = new Map();

    for (const row of FLAT) {
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
      section.dataset.restaurantId = String(info.rid ?? "");

      const h = document.createElement("h3");
      h.className = "ristorante-title";
      h.textContent = rname;
      section.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "cards";

      items.forEach(({ rid, rname, m }) => {
        const rawId = m.idmeals ?? m.idMeal ?? m.id ?? m._id;
        const id    = (rawId != null) ? String(rawId) : `${rid || "x"}::${mealName(m)}`;
        const name  = mealName(m);
        const cat   = mealCategory(m);
        const img   = firstImage(m);

        // prezzo = valore reale se presente, altrimenti per categoria
        const priceVal = mealPrice(m);
        const price    = (Number.isFinite(priceVal) && priceVal > 0) ? priceVal : fallbackPrice(cat);

        // memorizza oggetto NORMALIZZATO usato sia dal click che dal carrello
        const key = `${id}|${rid ?? ""}`;
        MAP.set(key, { id, name, price, image: img, category: cat, rid, rname });

        // --- Card UI
        const card = document.createElement("article");
        card.className = "card dish";
        card.dataset.key = key;

        const imgtag = document.createElement("img");
        imgtag.className = "dish-img";
        imgtag.alt = name;
        imgtag.src = img;

        const body = document.createElement("div");
        body.className = "dish-body";

        const title = document.createElement("div");
        title.className = "dish-title";
        title.textContent = name;

        const ingBox = document.createElement("div");
        ingBox.className = "dish-ings";
        if (cat) {
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = cat;
          ingBox.appendChild(chip);
        }
        const ings = extractIngredients(m);
        ings.forEach(x => {
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = x;
          ingBox.appendChild(chip);
        });

        const foot = document.createElement("div");
        foot.className = "dish-foot";

        const priceSpan = document.createElement("span");
        priceSpan.className = "dish-price";
        priceSpan.textContent = money(price);

        const btn = makeAddBtn(key);

        foot.appendChild(priceSpan);
        foot.appendChild(btn);
        body.appendChild(title);
        body.appendChild(ingBox);
        body.appendChild(foot);
        card.appendChild(imgtag);
        card.appendChild(body);
        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);
    }
  }

  /* ============ click (delegazione) ============ */
  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".add-to-cart");
      if (!btn) return;
      e.preventDefault();

      const key = btn.dataset.key || btn.closest(".card.dish")?.dataset.key || "";
      const info = MAP.get(key);
      if (!info) return console.warn("[CART] key non trovata");

      // salva anche image/category
      const cart = readCart();
      const idx = cart.findIndex(x => String(x.id) === String(info.id));
      if (idx >= 0) cart[idx].qty = (Number(cart[idx].qty) || 0) + 1;
      else cart.push({
        id: info.id,
        name: info.name,
        price: info.price,
        image: info.image,
        category: info.category,
        qty: 1,
        restaurantId: info.rid ?? null,
        restaurantName: info.rname || ""
      });
      saveCart(cart);

      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Added!";
      setTimeout(() => { btn.disabled = false; btn.textContent = old || "Add to cart"; }, 900);
    });
  }

  if (filterInput) filterInput.addEventListener("input", render);

  /* ============ boot ============ */
  async function boot() {
    updateBadge();
    try {
      RAW = await apiGet("/meals");
      FLAT = flatten(RAW);
      console.log("[MEALS] caricati:", FLAT.length, "piatti");
      render();
    } catch (err) {
      console.error("[MEALS] errore caricamento:", err);
      if (container) container.innerHTML = `<div class="error">Errore nel caricare i piatti.</div>`;
    }
  }
  window.addEventListener("DOMContentLoaded", boot);
})();

