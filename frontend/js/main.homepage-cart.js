(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

  const CART_KEY = "cart_home_v2";

  /* ===== cart ===== */
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

  /* ===== helpers ===== */
  function money(n) { return `€${Number(n || 0).toFixed(2)}`; }
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
  function mealCategory(m) {
    return m?.tipologia ?? m?.category ?? m?.strCategory ?? "";
  }

  // Prezzi di fallback per categorie TheMealDB / tue
  const PRICE_BY_CATEGORY = {
    Dessert: 4.5, Breakfast: 5.0, Starter: 6.0, Side: 4.0, Miscellaneous: 7.0,
    Vegetarian: 8.0, Vegan: 8.5, Pasta: 9.5, Chicken: 10.5, Pork: 11.0,
    Beef: 12.0, Lamb: 13.0, Seafood: 14.0, Fish: 13.0
  };
  function fallbackPrice(cat) {
    if (!cat) return 8.9;
    const key = String(cat).toLowerCase();
    const hit = Object.keys(PRICE_BY_CATEGORY).find(k => k.toLowerCase() === key);
    return hit ? PRICE_BY_CATEGORY[hit] : 8.9;
  }

  /* ===== data ===== */
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
    // dataset sicuri
    btn.dataset.id = payload.id;
    btn.dataset.name = payload.name;
    btn.dataset.price = String(payload.price);
    btn.dataset.rid = String(payload.rid ?? "");
    btn.dataset.rname = payload.rname;
    btn.dataset.category = payload.category || "";
    btn.dataset.image = payload.image || "";

    btn.addEventListener("click", () => {
      addToCart({
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: btn.dataset.price,
        rid: btn.dataset.rid,
        rname: btn.dataset.rname,
        category: btn.dataset.category,
        image: btn.dataset.image,
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
        const idRaw = m.idmeals ?? m.id ?? m._id ?? m.idMeal;
        const name = mealName(m);
        const cat  = mealCategory(m);
        const img  = firstImage(m);

        // prezzo reale o fallback per categoria
        const priceReal = mealPrice(m);
        const price = (Number(priceReal) > 0) ? Number(priceReal) : fallbackPrice(cat);

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
        if (cat) {
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = cat;
          ingBox.appendChild(chip);
        }
        const ings = extractIngredients(m);
        if (ings.length) {
          ings.forEach(x => {
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = x;
            ingBox.appendChild(chip);
          });
        } else if (!cat) {
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
          id, name, price, rid, rname, category: cat, image: img
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

  function addToCart({ id, name, price, rid, rname, category, image }) {
    const cart = readCart();
    if (!id) {
      console.warn("[CART] id mancante, non aggiungo", { id, name, price, rid, rname });
      alert("Impossibile aggiungere il piatto: ID mancante.");
      return;
    }

    // prezzo definitivo (se vuoto/0 usa fallback per categoria)
    let effPrice = Number(price);
    if (!Number.isFinite(effPrice) || effPrice <= 0) {
      effPrice = fallbackPrice(category);
    }

    const idx = cart.findIndex(it => String(it.id) === String(id));
    if (idx >= 0) {
      cart[idx].qty = (Number(cart[idx].qty) || 0) + 1;
    } else {
      cart.push({
        id: String(id),
        name: String(name || ""),
        price: effPrice,
        qty: 1,
        restaurantId: rid ?? null,
        restaurantName: String(rname || ""),
        category: category || "",
        image: image || ""
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
      const data = await apiGet("/meals"); // array di ristoranti
      RAW = data;
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


