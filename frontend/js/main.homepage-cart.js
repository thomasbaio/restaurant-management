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
    add({ id, name, price, rid, rname, image, category }) {
      const cart = this.read();
      const safeId = this.ensureId({ id, rid, name });

      // usa il parser robusto anche qui
      const parsed = parsePriceLike(price);
      const effPrice = (Number.isFinite(parsed) && parsed > 0) ? parsed : 8.9;

      const i = cart.findIndex(x => String(x.id) === String(safeId));
      if (i >= 0) {
        cart[i].qty = (Number(cart[i].qty) || 0) + 1;
      } else {
        cart.push({
          id: String(safeId),
          name: String(name || ""),
          price: effPrice,
          qty: 1,
          restaurantId: rid ?? null,
          restaurantName: String(rname || ""),
          image: image || "",
          category: category || ""
        });
      }
      this.write(cart);
    }
  };

  /* ================= helpers ================= */
  const money = n => `€${Number(n || 0).toFixed(2)}`;

  // parser robusto per stringhe prezzo: "€10", "10,00", "1.234,56", "EUR 12.5", ...
  function parsePriceLike(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    if (typeof v !== "string") return NaN;
    let s = v.trim();
    if (!s) return NaN;
    s = s.replace(/[^\d.,-]/g, ""); // tieni solo numeri, , . e -
    const hasComma = s.includes(",");
    const hasDot   = s.includes(".");
    if (hasComma && hasDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (hasComma && !hasDot) {
      s = s.replace(",", ".");
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  // accetta anche path relativi tipo "images/..." o "./img/..."
  const isValidImg = s => {
    if (typeof s !== "string") return false;
    const t = s.trim();
    if (!t || t === "-" || t === "#") return false;
    if (/^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/")) return true;
    // relative file path con estensione immagine
    if (/^(?:\.{0,2}\/)?[^?#]+\.(?:png|jpe?g|webp|gif|avif|svg)$/i.test(t)) return true;
    return false;
  };

  function firstImage(p) {
    const src = p || {}, raw = src._raw || src.raw || {};
    const fixed = [
      src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
      raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img,
    ];
    for (const u of fixed) if (isValidImg(u)) return u;

    // scan generico su tutte le proprietà stringa
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === "string" && isValidImg(v)) return v;
      if (typeof v === "string" && /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(v)) return v;
    }
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && isValidImg(v)) return v;
      if (typeof v === "string" && /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(v)) return v;
    }
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

  const mealName     = m => m?.name ?? m?.nome ?? m?.strMeal ?? "Untitled dish";
  const mealCategory = m => m?.tipologia ?? m?.category ?? m?.strCategory ?? "";

  // usa parsePriceLike su molte possibili chiavi + deep scan di chiavi che "sembrano" prezzo
  const mealPrice = (m) => {
    const raw = m?._raw || m?.raw || {};
    const candidates = [
      m?.prezzo, m?.price, m?.cost, m?.strPrice, m?.costo, m?.priceEUR, m?.prezzoEuro,
      raw?.prezzo, raw?.price, raw?.cost, raw?.strPrice, raw?.costo
    ];
    for (const v of candidates) {
      const n = parsePriceLike(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    // deep scan: trova una chiave che contenga 'price', 'prezz', 'cost', 'amount'
    const scanObj = (obj) => {
      for (const [k, v] of Object.entries(obj || {})) {
        if (v == null) continue;
        if (typeof v === "number" && v > 0 && /(price|prezz|costo|cost|amount|val)/i.test(k)) return v;
        if (typeof v === "string" && /(price|prezz|costo|cost|amount|val)/i.test(k)) {
          const n = parsePriceLike(v);
          if (Number.isFinite(n) && n > 0) return n;
        }
      }
      return NaN;
    };
    const n1 = scanObj(m);
    if (Number.isFinite(n1) && n1 > 0) return n1;
    const n2 = scanObj(raw);
    if (Number.isFinite(n2) && n2 > 0) return n2;

    return NaN; // così sappiamo che non esiste un prezzo valido
  };

  /* ================= state ================= */
  const container = document.getElementById("menu-by-restaurant");
  const filterInput = document.getElementById("filter-ingredient");
  let FLAT = [];           // [{ rid, rname, m }]
  const MAP = new Map();   // key -> { id, name, price, rid, rname, image, category }

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
      (r.menu || []).forEach(m => out.push({ rid, rname, m }));
    });
    return out;
  };

  /* ================= render ================= */
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
        const name  = mealName(m);
        const img   = firstImage(m);
        const cat   = mealCategory(m);

        // prezzo reale (parsing robusto) o fallback
        const pReal = mealPrice(m);
        const price = (Number.isFinite(pReal) && pReal > 0) ? pReal : 8.9;

        // key stabile (anche se manca l'id)
        const id  = (rawId != null) ? String(rawId) : `${rid || "x"}::${name}`;
        const key = `${id}|${rid ?? ""}`;

        // salviamo TUTTO ciò che serve al carrello
        MAP.set(key, { id, name, price, rid, rname, image: img, category: cat });

        const card = document.createElement("article");
        card.className = "card dish";
        card.dataset.key = key;
        card.dataset.id = id; // utile per la rete di sicurezza

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
  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".add-to-cart");
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();

      const key = btn.dataset.key || btn.closest(".card.dish")?.dataset.key || "";
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

  // attacco diretto fuori container
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".add-to-cart");
    if (!btn) return;
    if (btn.closest("#menu-by-restaurant")) return;
    e.preventDefault(); e.stopPropagation();

    const key = btn.dataset.key || btn.closest(".card.dish")?.dataset.key || "";
    const info = MAP.get(key);
    if (!info) return console.warn("[CART] (doc) key non mappata");
    Cart.add(info);
  }, true);

  // rete di sicurezza testuale
  document.addEventListener("click", (e) => {
    const el = e.target.closest("button, a");
    if (!el) return;
    const txt = (el.textContent || "").trim().toLowerCase();
    if (!txt || !/add\s*to\s*cart/.test(txt)) return;
    if (el.classList.contains("add-to-cart")) return;

    e.preventDefault(); e.stopPropagation();

    const card = el.closest(".card.dish");
    const key  = card?.dataset.key || "";
    if (key && MAP.has(key)) {
      Cart.add(MAP.get(key));
      return;
    }

    // fallback DOM puro
    const name  = card?.querySelector(".dish-title")?.textContent?.trim() || "";
    const pTxt  = card?.querySelector(".dish-price")?.textContent || "";
    const price = parsePriceLike(pTxt);
    const image = card?.querySelector(".dish-img")?.src || "";
    const section = el.closest(".ristorante-section");
    const rname = section?.querySelector(".ristorante-title")?.textContent?.trim() || "";
    const rid   = section?.dataset.restaurantId || "";
    const id    = card?.dataset.id || "";
    Cart.add({ id, name, price, rid, rname, image });
  }, true);

  /* ================= filtro ================= */
  if (filterInput) filterInput.addEventListener("input", render);

  /* ================= boot ================= */
  async function boot() {
    Cart.updateBadge();
    try {
      const data = await apiGet("/meals");
      FLAT = flatten(data);
      window.__MEALS_ALL__ = FLAT.map(x => x.m); // debug
      console.log("[MEALS] caricati:", FLAT.length);
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
    addFirst: () => {
      const first = MAP.values().next().value;
      if (!first) return console.warn("Nessun piatto in MAP");
      Cart.add(first);
    }
  };
})();


