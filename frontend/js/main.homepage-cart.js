(() => {
  /* ================= base ================= */
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

  /* ================= cart ================= */
  const CART_KEY = "cart_home_v2";

  const Cart = {
    read() {
      try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
      catch { return []; }
    },
    write(arr) {
      localStorage.setItem(CART_KEY, JSON.stringify(arr));
      this.updateBadge(arr);
      console.log("[CART] salvato:", arr);
    },
    updateBadge(arr = this.read()) {
      const b = document.getElementById("cartBadge");
      if (!b) return;
      const n = arr.reduce((s, x) => s + (Number(x.qty) || 0), 0);
      b.textContent = String(n);
    },
    ensureId({ id, rid, name }) {
      if (id) return String(id);
      const base = `${rid || "r"}::${name || "dish"}`;
      let h = 0; for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
      return `gen_${h}`;
    },
    add({ id, name, price, rid, rname }) {
      const cart = this.read();
      const safeId = this.ensureId({ id, rid, name });
      const i = cart.findIndex(x => String(x.id) === String(safeId));
      if (i >= 0) cart[i].qty = (Number(cart[i].qty) || 0) + 1;
      else cart.push({
        id: String(safeId),
        name: String(name || ""),
        price: Number(price) || 0,
        qty: 1,
        restaurantId: rid ?? null,
        restaurantName: String(rname || "")
      });
      this.write(cart);
    }
  };

  /* ================= helpers ================= */
  const money = n => `€${Number(n || 0).toFixed(2)}`;
  const parseMoney = t => {
    const n = Number(String(t).replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const isValidImg = s => typeof s === "string" && !!s.trim() &&
    (/^https?:\/\//i.test(s) || s.startsWith("//") || s.startsWith("/"));

  function firstImage(p) {
    const src = p || {}, raw = src._raw || src.raw || {};
    const cands = [
      src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
      raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img,
    ];
    for (const u of cands) if (isValidImg(u)) return u;
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
  const mealName  = m => m?.name ?? m?.nome ?? m?.strMeal ?? "Untitled dish";
  const mealPrice = m => {
    const v = [m?.prezzo, m?.price, m?.cost, m?.strPrice].find(x => x != null);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  /* ================= state ================= */
  const container = document.getElementById("menu-by-restaurant");
  const filterInput = document.getElementById("filter-ingredient");
  let RAW = [];
  let FLAT = [];           // [{ r, rid, rname, m }]
  const MAP = new Map();   // key -> { id, name, price, rid, rname }

  async function apiGet(path) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${API_BASE}${path}`, { signal: ctrl.signal, mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }
  const flatten = (data) => {
    const out = [];
    (data || []).forEach(r => {
      const rid = r.restaurantId ?? r.id ?? r._id ?? r.legacyId ?? null;
      const rname = r.nome ?? r.name ?? r.restaurantName ?? `Restaurant ${rid ?? ""}`.trim();
      (r.menu || []).forEach(m => out.push({ r, rid, rname, m }));
    });
    return out;
  };

  /* ================= render ================= */
  function makeAddBtn(key) {
    const btn = document.createElement("button");
    btn.className = "btn primary add-to-cart";
    btn.type = "button";           // impedisce submit accidentali
    btn.textContent = "Add to cart";
    btn.dataset.key = key;         // usiamo UNA chiave sicura
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
        const name  = mealName(m);
        const price = mealPrice(m);
        const img   = firstImage(m);
        const ings  = extractIngredients(m);

        // key stabile (anche se manca l'id)
        const id  = (rawId != null) ? String(rawId) : `${rid || "x"}::${name}`;
        const key = `${id}|${rid ?? ""}`;
        MAP.set(key, { id, name, price, rid, rname });

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

  /* ================= click handlers (tripla rete) ================= */
  // A) Delegazione sul container ufficiale
  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".add-to-cart");
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();

      let key = btn.dataset.key || btn.closest(".card.dish")?.dataset.key || "";
      const info = MAP.get(key);
      if (!info) {
        console.warn("[CART] key mancante o non trovata");
        return;
      }
      Cart.add(info);

      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Added!";
      setTimeout(() => { btn.disabled = false; btn.textContent = old || "Add to cart"; }, 900);
    });
  }

  // B) Attacco diretto (nel raro caso il DOM venga mosso fuori dal container)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".add-to-cart");
    if (!btn) return;
    if (btn.closest("#menu-by-restaurant")) return; // già gestito sopra
    e.preventDefault(); e.stopPropagation();

    const key = btn.dataset.key || btn.closest(".card.dish")?.dataset.key || "";
    const info = MAP.get(key);
    if (!info) return console.warn("[CART] (doc) key non mappata");
    Cart.add(info);
  }, true);

  // C) Rete di sicurezza: qualunque button/link con testo “Add to cart”
  document.addEventListener("click", (e) => {
    const el = e.target.closest("button, a");
    if (!el) return;
    const txt = (el.textContent || "").trim().toLowerCase();
    if (!txt || !/add\s*to\s*cart/.test(txt)) return;
    if (el.classList.contains("add-to-cart")) return; // già gestito

    e.preventDefault(); e.stopPropagation();
    // pesca dal contesto visivo
    const card = el.closest(".card.dish");
    const name = card?.querySelector(".dish-title")?.textContent?.trim() || "";
    const price = parseMoney(card?.querySelector(".dish-price")?.textContent || "");
    const section = el.closest(".ristorante-section");
    const rname = section?.querySelector(".ristorante-title")?.textContent?.trim() || "";
    const rid   = section?.dataset.restaurantId || "";
    const id    = card?.dataset.id || "";
    Cart.add({ id, name, price, rid, rname });
  }, true);

  /* ================= filtro ================= */
  const onFilter = () => render();
  if (filterInput) filterInput.addEventListener("input", onFilter);

  /* ================= boot ================= */
  async function boot() {
    Cart.updateBadge();
    try {
      RAW  = await apiGet("/meals");
      FLAT = (Array.isArray(RAW) ? RAW : []);
      FLAT = (FLAT.length ? FLAT : []); // hard guard
      FLAT = FLAT.flatMap(r => {
        const rid = r.restaurantId ?? r.id ?? r._id ?? r.legacyId ?? null;
        const rname = r.nome ?? r.name ?? r.restaurantName ?? `Restaurant ${rid ?? ""}`.trim();
        return (r.menu || []).map(m => ({ r, rid, rname, m }));
      });
      window.__MEALS_ALL__ = FLAT.map(x => x.m); // debug
      console.log("[MEALS] caricati:", FLAT);
      render();
    } catch (err) {
      console.error("[MEALS] errore caricamento:", err);
      const c = document.getElementById("menu-by-restaurant");
      if (c) c.innerHTML = `<div class="error">Errore nel caricare i piatti.</div>`;
    }
  }
  window.addEventListener("DOMContentLoaded", boot);

  /* ================= debug veloci ================= */
  window.__cart = {
    read: () => Cart.read(),
    clear: () => { localStorage.removeItem(CART_KEY); Cart.updateBadge([]); console.log("[CART] cleared"); },
    addFirst: () => {                   // aggiunge il primo piatto visibile
      const first = MAP.values().next().value;
      if (!first) return console.warn("Nessun piatto in MAP");
      Cart.add(first);
    }
  };
})();
;

