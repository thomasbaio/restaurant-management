// js/main.homepage-cart.js (versione robusta)
(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

  const CART_KEY = "cart_home_v2";

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
  function money(n) {
    const v = Number(n || 0);
    return `€${v.toFixed(2)}`;
  }
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
    const candidates = [m?.prezzo, m?.price, m?.cost];
    const v = candidates.find(v => v !== undefined && v !== null);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

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

  let RAW = [];
  let FLAT = [];

  function flatten(data) {
    const out = [];
    (data || []).forEach(r => {
      const rid = r.restaurantId ?? r.id ?? r._id ?? r.legacyId ?? null;
      const rname = r.nome ?? r.name ?? r.restaurantName ?? `Restaurant ${rid ?? ""}`.trim();
      (r.menu || []).forEach(m => out.push({ r, rid, rname, m }));
    });
    return out;
  }

  function makeAddBtn(payload) {
    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = "Add to cart";
    // set dataset via proprietà → niente problemi di encoding
    btn.dataset.id = payload.id;
    btn.dataset.name = payload.name;
    btn.dataset.price = String(payload.price);
    btn.dataset.rid = String(payload.rid ?? "");
    btn.dataset.rname = payload.rname;

    btn.addEventListener("click", () => {
      addToCart({
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: btn.dataset.price,
        rid: btn.dataset.rid,
        rname: btn.dataset.rname,
      });
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Added!";
      setTimeout(() => { btn.disabled = false; btn.textContent = old; }, 900);
    });

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

      const h = document.createElement("h3");
      h.className = "ristorante-title";
      h.textContent = rname;
      section.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "cards";

      items.forEach(({ rid, rname, m }) => {
        const idRaw = m.idmeals ?? m.id ?? m._id;
        const name = mealName(m);
        const price = mealPrice(m);
        const img = firstImage(m);
        const ings = extractIngredients(m);

        // se manca un id, usa fallback stabile
        const id = (idRaw !== undefined && idRaw !== null) ? String(idRaw) : `${rid || "x"}:${name}`;

        const card = document.createElement("article");
        card.className = "card dish";

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
          id,
          name,
          price,
          rid,
          rname
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

  function addToCart({ id, name, price, rid, rname }) {
    const cart = readCart();

    // se per qualche motivo id è vuoto, fermiamoci con log chiaro
    if (!id) {
      console.warn("[CART] id mancante, non aggiungo", { id, name, price, rid, rname });
      alert("Impossibile aggiungere il piatto: ID mancante.");
      return;
    }

    const idx = cart.findIndex(it => String(it.id) === String(id));
    if (idx >= 0) {
      cart[idx].qty = (Number(cart[idx].qty) || 0) + 1;
    } else {
      cart.push({
        id: String(id),
        name: String(name || ""),
        price: Number(price) || 0,
        qty: 1,
        restaurantId: rid ?? null,
        restaurantName: String(rname || "")
      });
    }
    saveCart(cart);
  }

  if (filterInput) {
    filterInput.addEventListener("input", render);
  }

  async function boot() {
    updateBadge();
    try {
      RAW = await apiGet("/meals"); // array di ristoranti
      FLAT = flatten(RAW);
      console.log("[MEALS] caricati:", FLAT);
      render();
    } catch (err) {
      console.error("[MEALS] errore caricamento:", err);
      if (container) container.innerHTML = `<div class="error">Errore nel caricare i piatti.</div>`;
    }
  }
  window.addEventListener("DOMContentLoaded", boot);
})();
