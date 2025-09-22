// js/main.homepage-cart.js (versione robusta)
(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

  const CART_KEY = "cart_home_v2";

  /* ===================== cart helpers ===================== */
  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
    catch { return []; }
  }
  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateBadge(cart);
    console.log("[CART] salvato:", cart);
  }
  function updateBadge(cart = readCart()) {
    const badge = document.getElementById("cartBadge");
    if (!badge) return;
    const count = cart.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    badge.textContent = String(count);
  }
  function money(n) {
    const v = Number(n || 0);
    return `€${v.toFixed(2)}`;
  }
  function parseMoney(txt) {
    // "€12,50" -> 12.5
    const n = Number(String(txt).replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  /* ===================== image & fields helpers ===================== */
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
  function mealName(m) {
    return m?.name ?? m?.nome ?? m?.strMeal ?? "Untitled dish";
  }
  function mealPrice(m) {
    const candidates = [m?.prezzo, m?.price, m?.cost, m?.strPrice];
    const v = candidates.find(v => v !== undefined && v !== null);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /* ===================== data state ===================== */
  const container = document.getElementById("menu-by-restaurant");
  const filterInput = document.getElementById("filter-ingredient");
  let RAW = [];
  let FLAT = []; // [{ r, rid, rname, m }]

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

  /* ===================== render ===================== */
  function makeAddBtn(payload) {
    const btn = document.createElement("button");
    btn.className = "btn primary add-to-cart";
    btn.textContent = "Add to cart";
    // dataset sicuro
    btn.dataset.id = payload.id ?? "";
    btn.dataset.name = payload.name ?? "";
    btn.dataset.price = String(payload.price ?? "");
    btn.dataset.rid = String(payload.rid ?? "");
    btn.dataset.rname = payload.rname ?? "";
    // NB: il click lo gestiamo via DELEGAZIONE (vedi sotto)
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
        const idRaw = m.idmeals ?? m.idMeal ?? m.id ?? m._id;
        const name = mealName(m);
        const price = mealPrice(m);
        const img = firstImage(m);
        const ings = extractIngredients(m);

        // ID fallback stabile
        const id = (idRaw !== undefined && idRaw !== null) ? String(idRaw) : `${rid || "x"}::${name}`;

        const card = document.createElement("article");
        card.className = "card dish";
        card.dataset.dish = "1"; // segnaposto per selettori
        card.dataset.id = id;

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
        if (ings.length) {
          ings.forEach(x => {
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = x;
            ingBox.appendChild(chip);
          });
        } else {
          const em = document.createElement("em");
          em.textContent = "No ingredients";
          ingBox.appendChild(em);
        }

        const foot = document.createElement("div");
        foot.className = "dish-foot";

        const priceSpan = document.createElement("span");
        priceSpan.className = "dish-price";
        priceSpan.textContent = money(price);

        const btn = makeAddBtn({
          id, name, price, rid, rname
        });

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

  /* ===================== add to cart (delegazione) ===================== */
  function ensureId({ id, rid, name }) {
    if (id) return String(id);
    const base = `${rid || "r"}::${name || "dish"}`;
    let h = 0; for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
    return `gen_${h}`;
  }

  function addToCart({ id, name, price, rid, rname }) {
    const cart = readCart();
    const safeId = ensureId({ id, rid, name });
    const idx = cart.findIndex(it => String(it.id) === String(safeId));
    if (idx >= 0) {
      cart[idx].qty = (Number(cart[idx].qty) || 0) + 1;
    } else {
      cart.push({
        id: String(safeId),
        name: String(name || ""),
        price: Number(price) || 0,
        qty: 1,
        restaurantId: rid ?? null,
        restaurantName: String(rname || "")
      });
    }
    writeCart(cart);
  }

  // CATTURA TUTTI I CLICK sui bottoni add-to-cart
  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-add-cart], [data-add-to-cart], .add-to-cart");
      if (!btn) return;

      e.preventDefault();

      // 1) prova dataset
      let id   = btn.dataset.id || "";
      let name = btn.dataset.name || "";
      let price = btn.dataset.price || "";
      let rid  = btn.dataset.rid || "";
      let rname = btn.dataset.rname || "";

      // 2) fallback: leggi dal DOM circostante
      const card = btn.closest(".card.dish");
      if (card) {
        if (!id)    id = card.dataset.id || "";
        if (!name)  name = card.querySelector(".dish-title")?.textContent?.trim() || "";
        if (!price) price = parseMoney(card.querySelector(".dish-price")?.textContent || "");
        const section = card.closest(".ristorante-section");
        if (!rname && section) rname = section.querySelector(".ristorante-title")?.textContent?.trim() || "";
        if (!rid && section) rid = section.dataset.restaurantId || "";
      }

      addToCart({ id, name, price, rid, rname });

      // feedback UI
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Added!";
      setTimeout(() => { btn.disabled = false; btn.textContent = old || "Add to cart"; }, 900);
    });
  }

  /* ===================== filtro ===================== */
  if (filterInput) filterInput.addEventListener("input", render);

  /* ===================== boot ===================== */
  async function boot() {
    updateBadge();
    try {
      RAW = await apiGet("/meals");
      FLAT = flatten(RAW);
      // utile per debug da console
      window.__MEALS_ALL__ = FLAT.map(x => x.m);
      console.log("[MEALS] caricati:", FLAT);
      render();
    } catch (err) {
      console.error("[MEALS] errore caricamento:", err);
      if (container) container.innerHTML = `<div class="error">Errore nel caricare i piatti.</div>`;
    }
  }
  window.addEventListener("DOMContentLoaded", boot);

  // debug veloce
  window.__cart = {
    read: () => readCart(),
    clear: () => { localStorage.removeItem(CART_KEY); updateBadge([]); console.log("[CART] cleared"); }
  };
})();
