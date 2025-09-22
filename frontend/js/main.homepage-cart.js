// js/main.homepage-cart.js — versione stabile: usa una MAP per i piatti
(() => {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

  const CART_KEY = "cart_home_v2";

  /* ========== CART ========== */
  const Cart = {
    read() {
      try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
      catch { return []; }
    },
    write(arr) {
      localStorage.setItem(CART_KEY, JSON.stringify(arr));
      this.badge(arr);
      console.log("[CART] salvato:", arr);
    },
    badge(arr = this.read()) {
      const b = document.getElementById("cartBadge");
      if (!b) return;
      const n = arr.reduce((s, x) => s + (Number(x.qty) || 0), 0);
      b.textContent = String(n);
    },
    add(item) {
      // item: {id,name,price,category,image,restaurantId,restaurantName}
      const cart = this.read();
      const id = String(item.id);
      const idx = cart.findIndex(x => String(x.id) === id);
      if (idx >= 0) cart[idx].qty = (Number(cart[idx].qty) || 0) + 1;
      else cart.push({ ...item, qty: 1 });
      this.write(cart);
    }
  };

  /* ========== HELPERS ========== */
  const money = n => `€${Number(n || 0).toFixed(2)}`;
  const isValidImg = s => typeof s === "string" && !!s.trim() && (/^https?:\/\//i.test(s) || s.startsWith("//") || s.startsWith("/"));
  function firstImage(p) {
    const src = p || {}, raw = src._raw || src.raw || {};
    const c = [src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
               raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img];
    for (const u of c) if (isValidImg(u)) return u;
    return "images/placeholder.png";
  }
  const mealName  = m => m?.name ?? m?.nome ?? m?.strMeal ?? "Dish";
  const mealCat   = m => m?.tipologia ?? m?.category ?? m?.strCategory ?? "";
  const mealPrice = m => {
    const v = [m?.prezzo, m?.price, m?.cost, m?.strPrice].find(x => x != null);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const PRICE_BY_CATEGORY = {
    Dessert: 4.5, Breakfast: 5.0, Starter: 6.0, Side: 4.0, Miscellaneous: 7.0,
    Vegetarian: 8.0, Vegan: 8.5, Pasta: 9.5, Chicken: 10.5, Pork: 11.0,
    Beef: 12.0, Lamb: 13.0, Seafood: 14.0, Fish: 13.0
  };
  function fallbackPrice(cat) {
    if (!cat) return 8.9;
    const k = Object.keys(PRICE_BY_CATEGORY).find(x => x.toLowerCase() === String(cat).toLowerCase());
    return k ? PRICE_BY_CATEGORY[k] : 8.9;
  }

  /* ========== STATE ========== */
  const container = document.getElementById("menu-by-restaurant");
  const filterInput = document.getElementById("filter-ingredient");

  // Mappa piatti: key -> oggetto NORMALIZZATO per il carrello
  // key = `${id}|${restaurantId}`
  const DISH_MAP = new Map();

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
      (r.menu || []).forEach(m => out.push({ rid, rname, m }));
    });
    return out;
  }

  /* ========== RENDER ========== */
  function makeAddBtn(key) {
    const btn = document.createElement("button");
    btn.className = "btn primary add-to-cart";
    btn.type = "button";
    btn.textContent = "Add to cart";
    btn.dataset.key = key;              // ci basta SOLO la chiave
    return btn;
  }

  function renderFrom(flatList) {
    if (!container) return;
    container.innerHTML = "";

    // grouping + filtro
    const needle = (filterInput?.value || "").trim().toLowerCase();
    const group = new Map();
    for (const row of flatList) {
      const ings = Array.from({ length: 20 }, (_, i) => row.m[`strIngredient${i+1}`]).filter(Boolean).map(s => String(s).toLowerCase());
      if (needle && !ings.some(x => x.includes(needle))) continue;
      const k = row.rid ?? row.rname;
      if (!group.has(k)) group.set(k, { rname: row.rname, rid: row.rid, items: [] });
      group.get(k).items.push(row);
    }

    if (!group.size) {
      container.innerHTML = `<div class="empty">Nessun piatto trovato.</div>`;
      return;
    }

    for (const { rname, rid, items } of group.values()) {
      const section = document.createElement("div");
      section.className = "ristorante-section";
      section.dataset.restaurantId = String(rid ?? "");

      const h = document.createElement("h3");
      h.className = "ristorante-title";
      h.textContent = rname;
      section.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "cards";

      items.forEach(({ m }) => {
        // normalizza ORA (una volta sola)
        const rawId = m.idmeals ?? m.idMeal ?? m.id ?? m._id;
        const id    = (rawId != null) ? String(rawId) : `${rid || "x"}::${mealName(m)}`;
        const name  = mealName(m);
        const cat   = mealCat(m);
        const img   = firstImage(m);
        const p     = mealPrice(m);
        const price = (p > 0) ? p : fallbackPrice(cat);

        const key = `${id}|${rid ?? ""}`;
        DISH_MAP.set(key, {
          id, name,
          price,
          category: cat || "",
          image: img || "",
          restaurantId: rid ?? null,
          restaurantName: rname || ""
        });

        // --- Card
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

  /* ========== CLICK (SOLO MAP) ========== */
  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".add-to-cart");
      if (!btn) return;
      e.preventDefault();

      const key = btn.dataset.key || btn.closest(".card.dish")?.dataset.key || "";
      const item = DISH_MAP.get(key);
      if (!item) {
        console.warn("[CART] item non trovato per key:", key);
        return;
      }
      Cart.add(item); // 👈 salva l’oggetto normalizzato (name/price/category/image inclusi)

      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Added!";
      setTimeout(() => { btn.disabled = false; btn.textContent = old || "Add to cart"; }, 900);
    });
  }

  if (filterInput) filterInput.addEventListener("input", () => {
    // rigenera dall’elenco originale
    renderFrom(window.__FLAT_MENU || []);
  });

  /* ========== BOOT ========== */
  async function boot() {
    Cart.badge();
    try {
      const data = await apiGet("/meals");
      const FLAT = flatten(data);
      window.__FLAT_MENU = FLAT; // debug
      console.log("[MEALS] caricati:", FLAT.length);
      renderFrom(FLAT);
    } catch (err) {
      console.error("[MEALS] errore caricamento:", err);
      if (container) container.innerHTML = `<div class="error">Errore nel caricare i piatti.</div>`;
    }
  }
  window.addEventListener("DOMContentLoaded", boot);

  // utilità di debug (facoltative)
  window.__cart = {
    read: () => Cart.read(),
    clear: () => { localStorage.removeItem(CART_KEY); Cart.badge([]); console.log("[CART] cleared"); }
  };
})();
