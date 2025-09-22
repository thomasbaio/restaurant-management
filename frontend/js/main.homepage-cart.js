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

  /* ============= helpers UI / data ============= */
  function money(n) { return `€${Number(n || 0).toFixed(2)}`; }
  function parseMoney(txt) {
    const n = Number(String(txt).replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
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
  function mealName(m) { return m?.name ?? m?.nome ?? m?.strMeal ?? "Untitled dish"; }
  function mealPrice(m) {
    const candidates = [m?.prezzo, m?.price, m?.cost, m?.strPrice];
    const v = candidates.find(v => v !== undefined && v !== null);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /* ============= stato e fetch ============= */
  const container   = document.getElementById("menu-by-restaurant");
  const filterInput = document.getElementById("filter-ingredient");
  let RAW = [];
  let FLAT = [];   // [{ r, rid, rname, m }]
  let MEAL_BY_KEY = new Map(); // chiave -> oggetto piatto (per recupero certo al click)

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

  /* ============= render ============= */
  function makeAddBtn(payload) {
    const btn = document.createElement("button");
    btn.className = "btn primary add-to-cart";
    btn.type = "button";
    btn.textContent = "Add to cart";
    btn.dataset.key = payload.key;      // 👈 usiamo una chiave sicura invece di vari dataset sparsi
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

        // chiave stabile (serve anche se manca l'id)
        const id = (rawId !== undefined && rawId !== null) ? String(rawId) : `${rid || "x"}::${name}`;
        const key = `${id}|${rid ?? ""}`;

        // mappa per recupero sicuro al click
        MEAL_BY_KEY.set(key, { id, rid, rname, name, price });

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

        const btn = makeAddBtn({ key });

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

  /* ============= delega click ============= */
  if (container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".add-to-cart");
      if (!btn) return;

      // ricava la chiave dal bottone o dalla card
      let key = btn.dataset.key || "";
      if (!key) {
        const card = btn.closest(".card.dish");
        key = card?.dataset.key || "";
      }
      if (!key) {
        console.warn("[CART] key mancante sul bottone");
        return;
      }

      // prendi i dati sicuri dalla mappa
      const info = MEAL_BY_KEY.get(key);
      if (!info) {
        // fallback dal DOM (non dovrebbe servire, ma per sicurezza)
        const card = btn.closest(".card.dish");
        const name  = card?.querySelector(".dish-title")?.textContent?.trim() || "";
        const price = parseMoney(card?.querySelector(".dish-price")?.textContent || "");
        const section = btn.closest(".ristorante-section");
        const rname = section?.querySelector(".ristorante-title")?.textContent?.trim() || "";
        const rid   = section?.dataset.restaurantId || "";
        const id    = (card?.dataset.id) || "";
        Cart.add({ id, name, price, rid, rname });
      } else {
        Cart.add(info);
      }

      // feedback
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Added!";
      setTimeout(() => { btn.disabled = false; btn.textContent = old || "Add to cart"; }, 900);
    });
  }

  /* ============= filtro ============= */
  if (filterInput) filterInput.addEventListener("input", render);

  /* ============= boot ============= */
  async function boot() {
    Cart.updateBadge(); // badge iniziale
    try {
      RAW = await apiGet("/meals");
      FLAT = flatten(RAW);
      window.__MEALS_ALL__ = FLAT.map(x => x.m); // utile per debug
      console.log("[MEALS] caricati:", FLAT);
      render();
    } catch (err) {
      console.error("[MEALS] errore caricamento:", err);
      if (container) container.innerHTML = `<div class="error">Errore nel caricare i piatti.</div>`;
    }
  }
  window.addEventListener("DOMContentLoaded", boot);

  // utilità per debug
  window.__cart = {
    read: () => Cart.read(),
    clear: () => { localStorage.removeItem(CART_KEY); Cart.updateBadge([]); console.log("[CART] cleared"); }
  };
})();

