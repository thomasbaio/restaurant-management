// js/order.js — single dish (con dishId) + order builder multi-piatto (senza dishId)
(() => {
  "use strict";

  /* -------- auth: cliente -------- */
  const user = JSON.parse(localStorage.getItem("loggedUser") || "null");
  if (!user || user.role !== "cliente") {
    alert("You must be logged in as a customer to place an order.");
    location.href = "login.html";
    throw new Error("User not logged in as customer");
  }

  /* -------- API base -------- */
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const DEFAULT_API_BASE = isLocal ? "http://localhost:3000" : location.origin;
  const API_BASE = localStorage.getItem("API_BASE") || DEFAULT_API_BASE;

  /* -------- helpers -------- */
  const qs  = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));
  const fmt = (n) => `€${(Number(n || 0)).toFixed(2)}`;
  const getParam = (k) => new URLSearchParams(location.search).get(k) || "";

  function isValidImgPath(s) {
    if (typeof s !== "string") return false;
    const t = s.trim();
    if (!t || t === "#" || t === "-") return false;
    return /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/");
  }
  function firstImage(p) {
    const src = p || {};
    const raw = src.raw || {};
    const cands = [
      // normalizzato
      src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
      // originale (raw)
      raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img,
    ];
    for (let u of cands) {
      if (!isValidImgPath(u)) continue;
      u = String(u).trim();
      return u.startsWith("//") ? "https:" + u : u;
    }
    return "";
  }
  function pickImageURL(p) {
    const u = firstImage(p);
    if (isValidImgPath(u)) return u.startsWith("/") ? location.origin + u : u;
    const label = encodeURIComponent((p.nome || p.strMeal || p.name || "Food").split(" ")[0]);
    return `https://placehold.co/160x120?text=${label}`;
  }
  function normalizeKey(nome, cat) {
    const strip = (s) => String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim().replace(/\s+/g, " ");
    return `${strip(nome)}|${strip(cat)}`;
  }
  async function buildFileImageMap() {
    try {
      const res = await fetch(`${API_BASE}/meals/common-meals?source=file`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const arr = await res.json();
      const map = new Map();
      (Array.isArray(arr) ? arr : []).forEach(m => {
        const url = firstImage(m);
        if (!isValidImgPath(url)) return;
        const nome = m.nome ?? m.strMeal ?? m.name ?? "";
        const cat  = m.tipologia ?? m.strCategory ?? m.category ?? "";
        const key = normalizeKey(nome, cat);
        if (!map.has(key)) map.set(key, url);
      });
      return map;
    } catch {
      return new Map();
    }
  }
  function ensureImageFallback(meal, imgMap) {
    if (!meal) return meal;
    const has = isValidImgPath(meal.immagine) || isValidImgPath(firstImage(meal));
    if (has) return meal;
    const key = normalizeKey(meal.name || meal.nome, meal.category || meal.tipologia);
    const url = imgMap.get(key);
    if (isValidImgPath(url)) meal.immagine = url;
    return meal;
  }

  function normalizeMeal(raw, restaurantIdFallback) {
    let id = raw.idmeals ?? raw.idMeal ?? raw.id ?? raw._id ?? null;
    if (id != null) id = String(id);
    const name = raw.nome ?? raw.strMeal ?? raw.name ?? "No name";
    const category = raw.tipologia ?? raw.category ?? raw.strCategory ?? "";
    let price = raw.prezzo ?? raw.price ?? 0;
    if (typeof price === "string") {
      const n = Number(price.replace(",", "."));
      price = Number.isFinite(n) ? n : 0;
    }
    const restaurantId = raw.restaurantId ?? restaurantIdFallback ?? "";
    const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients.filter(Boolean) : [];
    const description = raw.descrizione ?? raw.description ?? raw.strInstructions ?? "";
    const immagine = firstImage(raw); // porta in alto l'immagine se già disponibile
    return { id, name, price: Number(price), category, restaurantId, ingredients, description, immagine, raw };
  }

  async function fetchMeals() {
    for (const path of ["/meals", "/api/meals"]) {
      try {
        const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json" } });
        if (res.ok) return await res.json();
      } catch {}
    }
    throw new Error("Cannot load meals");
  }

  async function loadMealById(dishId, restaurantIdHint) {
    const [data, imgMap] = await Promise.all([fetchMeals(), buildFileImageMap()]);
    let list = [];

    if (Array.isArray(data) && data.some((r) => Array.isArray(r.menu))) {
      for (const r of data) {
        const rid = r.restaurantId ?? r.idRestaurant ?? r.id ?? r._id ?? "";
        for (const m of r.menu || []) list.push(normalizeMeal(m, rid));
      }
    } else if (Array.isArray(data)) {
      list = data.map((m) => normalizeMeal(m));
    }

    const found =
      list.find((x) => String(x.id) === String(dishId)) ||
      list.find((x) => String(x.raw?.idmeals) === String(dishId)) ||
      list.find((x) => String(x.raw?._id) === String(dishId));

    if (!found) throw new Error("Dish not found");
    ensureImageFallback(found, imgMap);
    if (restaurantIdHint && !found.restaurantId) found.restaurantId = String(restaurantIdHint);
    return found;
  }

  /* =================== NUOVO: ordine singolo =================== */
  let currentMeal = null;
  let qty = 1;
  const FEES = 0;

  function renderDish() {
    const root = qs("#dish");
    if (!root || !currentMeal) return;
    root.innerHTML = `
      <img src="${pickImageURL(currentMeal)}" alt="Photo of ${currentMeal.name}" loading="lazy">
      <div style="flex:1;">
        <h2 style="margin:0 0 6px;">${currentMeal.name}</h2>
        ${currentMeal.category ? `<div class="muted" style="margin-bottom:6px;">${currentMeal.category}</div>` : ""}
        ${currentMeal.ingredients?.length ? `<div class="muted" style="margin-bottom:6px;">Ingredients: ${currentMeal.ingredients.join(", ")}</div>` : ""}
        ${currentMeal.description ? `<div class="muted" style="margin-bottom:6px;">${currentMeal.description}</div>` : ""}
        <div class="line"><span class="muted">Unit price</span> <strong>${fmt(currentMeal.price)}</strong></div>
        <label style="display:inline-flex;align-items:center;gap:8px;margin-top:8px;">
          Quantity
          <input id="qty" class="qty-input" type="number" min="1" max="99" step="1" value="${qty}">
        </label>
      </div>
    `;

    const qtyInput = qs("#qty");
    qtyInput?.addEventListener("input", () => {
      const v = Math.max(1, Math.min(99, Number(qtyInput.value || 1)));
      qty = v;
      qtyInput.value = String(v);
      renderSummary();
    });
  }

  function renderSummary() {
    const sum = qs("#summary");
    if (!sum || !currentMeal) return;
    const sub = currentMeal.price * qty;
    sum.innerHTML = `<div class="line"><span>${currentMeal.name} × ${qty}</span><span>${fmt(sub)}</span></div>`;
    const s = qs("#subtotal"), f = qs("#fees"), t = qs("#total");
    if (s) s.textContent = fmt(sub);
    if (f) f.textContent = fmt(FEES);
    if (t) t.textContent = fmt(sub + FEES);
  }

  async function submitSingleOrder(e) {
    e.preventDefault();
    if (!currentMeal) { alert("Dish not loaded."); return; }
    const fd = new FormData(e.target);
    const delivery = fd.get("delivery") || "pickup";
    const payment  = fd.get("payment")  || "carta_credito";

    const item = {
      dishId: String(currentMeal.id),
      name: currentMeal.name,
      price: Number(currentMeal.price),
      qty,
      restaurantId: currentMeal.restaurantId || "",
      imageUrl: pickImageURL(currentMeal)
    };

    const body = {
      userId: user._id || user.id || user.username || "",
      restaurantId: item.restaurantId,
      items: [item],
      delivery, payment,
      subtotal: Number((item.price * qty).toFixed(2)),
      fees: Number(FEES),
      total: Number((item.price * qty + FEES).toFixed(2)),
      status: "ordinato",
      createdAt: new Date().toISOString()
    };

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text().catch(()=>res.statusText));
      alert("Order placed successfully!");
      location.href = "i-miei-ordini.html";
    } catch (err) {
      console.warn("POST /orders failed, fallback local:", err.message);
      const key="orders_local_fallback";
      const arr=JSON.parse(localStorage.getItem(key)||"[]"); arr.push(body);
      localStorage.setItem(key, JSON.stringify(arr));
      alert("Order saved locally (offline mode).");
      location.href = "i-miei-ordini.html";
    }
  }

  /* ============== BUILDER: più piatti e somme (senza dishId) ============== */
  function renderBuilderList(container, groups) {
    container.innerHTML = "";
    groups.forEach(g => {
      const sect = document.createElement("fieldset");
      sect.className = "restaurant-section";
      const legend = document.createElement("legend");
      legend.textContent = g.name;
      sect.appendChild(legend);

      g.items.forEach(m => {
        const row = document.createElement("div");
        row.className = "meal-item";
        row.innerHTML = `
          <div class="meal-row" style="display:flex;gap:10px;align-items:center;justify-content:space-between;">
            <div style="display:flex;gap:10px;align-items:center;flex:1;">
              <img src="${pickImageURL(m)}" alt="${m.name}" width="80" height="60"
                   style="object-fit:cover;border-radius:8px;background:#f3f4f6" onerror="this.style.display='none'">
              <div>
                <div><strong>${m.name}</strong> ${m.category ? `<em class="muted">(${m.category})</em>` : ""}</div>
                <div class="muted">${fmt(m.price)}</div>
              </div>
            </div>
            <label class="muted" style="display:flex;align-items:center;gap:6px;">
              Qty
              <input type="number" class="qty" data-id="${m.id}" data-price="${m.price}"
                     data-rid="${m.restaurantId}" min="0" max="99" step="1" value="0"
                     style="width:70px">
            </label>
          </div>`;
        sect.appendChild(row);
      });

      container.appendChild(sect);
    });
  }

  function recomputeBuilderTotal(container) {
    const inputs = container.querySelectorAll("input.qty");
    let total = 0;
    inputs.forEach(inp => {
      const q = Math.max(0, Math.min(99, Number(inp.value || 0)));
      const p = Number(inp.dataset.price || 0);
      if (q > 0 && Number.isFinite(p)) total += q * p;
    });
    const totalEl = qs("#total");
    if (totalEl) totalEl.textContent = `Total: ${fmt(total)}`;
    // Mostra un piccolo riepilogo nella sezione "Order summary" se esiste
    const sumBox = qs("#summary");
    if (sumBox) {
      const lines = [];
      inputs.forEach(inp => {
        const q = Number(inp.value || 0);
        if (q > 0) {
          const row = inp.closest(".meal-row");
          const name = row?.querySelector("strong")?.textContent || "Dish";
          const price = Number(inp.dataset.price || 0);
          lines.push(`<div class="line"><span>${name} × ${q}</span><span>${fmt(q*price)}</span></div>`);
        }
      });
      sumBox.innerHTML = lines.join("") || "";
      const s = qs("#subtotal"), f = qs("#fees"), t = qs("#total");
      const subtotal = total;
      if (s) s.textContent = fmt(subtotal);
      if (f) f.textContent = fmt(0);
      if (t) t.textContent = fmt(subtotal);
    }
  }

  async function buildGroupsForBuilder() {
    const [data, imgMap] = await Promise.all([fetchMeals(), buildFileImageMap()]);
    const groupsMap = new Map(); // rid -> { name, items[] }

    function ensure(rid, name) {
      const k = String(rid || "");
      if (!groupsMap.has(k)) {
        groupsMap.set(k, { name: name || (k ? `Restaurant ${k}` : "Restaurant"), items: [] });
      } else if (name && /^Restaurant /.test(groupsMap.get(k).name)) {
        groupsMap.get(k).name = name;
      }
      return groupsMap.get(k);
    }

    if (Array.isArray(data) && data.some((r) => Array.isArray(r.menu))) {
      for (const r of data) {
        const rid = r.restaurantId ?? r.idRestaurant ?? r.id ?? r._id ?? "";
        const rname = r.nome ?? r.name ?? r.restaurantName ?? "";
        const g = ensure(rid, rname);
        for (const m of r.menu || []) {
          const nm = normalizeMeal(m, rid);
          ensureImageFallback(nm, imgMap);
          g.items.push(nm);
        }
      }
    } else if (Array.isArray(data)) {
      for (const m of data) {
        const nm = normalizeMeal(m);
        ensureImageFallback(nm, imgMap);
        const g = ensure(nm.restaurantId, "");
        g.items.push(nm);
      }
    }

    return Array.from(groupsMap.values()).filter((g) => g.items.length);
  }

  async function submitBuilderOrder(e, container) {
    e.preventDefault();
    const inputs = container.querySelectorAll("input.qty");
    const items = [];
    let restaurantId = null;

    inputs.forEach(inp => {
      const q = Math.max(0, Math.min(99, Number(inp.value || 0)));
      if (q <= 0) return;
      const price = Number(inp.dataset.price || 0);
      const dishId = String(inp.dataset.id || "");
      const rid = String(inp.dataset.rid || "");
      const row = inp.closest(".meal-row");
      const name = row?.querySelector("strong")?.textContent || "Dish";
      const img = row?.querySelector("img")?.getAttribute("src") || "";

      if (!restaurantId) restaurantId = rid;
      if (restaurantId && rid && restaurantId !== rid) {
        restaurantId = "__MIXED__";
      }

      items.push({ dishId, name, price, qty: q, restaurantId: rid, imageUrl: img });
    });

    if (!items.length) {
      alert("Select at least one dish (set Qty > 0).");
      return;
    }

    if (restaurantId === "__MIXED__") {
      alert("Please select dishes from a single restaurant.");
      return;
    }

    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const body = {
      userId: user._id || user.id || user.username || "",
      restaurantId: restaurantId || "",
      items,
      delivery: "pickup",
      payment: "carta_credito",
      subtotal: Number(subtotal.toFixed(2)),
      fees: 0,
      total: Number(subtotal.toFixed(2)),
      status: "ordinato",
      createdAt: new Date().toISOString()
    };

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text().catch(()=>res.statusText));
      alert("Order placed successfully!");
      location.href = "i-miei-ordini.html";
    } catch (err) {
      console.warn("POST /orders failed, fallback local:", err.message);
      const key="orders_local_fallback";
      const arr=JSON.parse(localStorage.getItem(key)||"[]"); arr.push(body);
      localStorage.setItem(key, JSON.stringify(arr));
      alert("Order saved locally (offline mode).");
      location.href = "i-miei-ordini.html";
    }
  }

  /* ============================ boot ============================ */
  window.addEventListener("DOMContentLoaded", async () => {
    const dishId = getParam("dishId");
    const rid    = getParam("restaurantId");

    // ——— Modalità singolo piatto (con dishId)
    if (dishId) {
      try {
        currentMeal = await loadMealById(dishId, rid);
        renderDish();
        renderSummary();
        qs("#order-form")?.addEventListener("submit", submitSingleOrder);
      } catch (e) {
        console.error(e);
        (qs("#dish") || qs("#meals-list"))?.insertAdjacentHTML(
          "beforeend",
          `<p class="muted">Dish not available. <a href="ricerca_piatti.html">Back to dishes</a></p>`
        );
        qs("#order-form")?.addEventListener("submit", (ev) => ev.preventDefault());
      }
      return;
    }

    // ——— Modalità builder (senza dishId): più piatti e somma totale
    const listEl = qs("#meals-list");
    if (listEl) {
      try {
        const groups = await buildGroupsForBuilder();
        if (!groups.length) {
          listEl.innerHTML = `<p>No dishes available.</p>`;
          return;
        }
        renderBuilderList(listEl, groups);

        // ricalcolo totale al cambio quantità
        listEl.addEventListener("input", (e) => {
          if (e.target && e.target.classList.contains("qty")) {
            const v = Math.max(0, Math.min(99, Number(e.target.value || 0)));
            e.target.value = String(v);
            recomputeBuilderTotal(listEl);
          }
        });
        recomputeBuilderTotal(listEl);

        const form = qs("#order-form");
        form?.addEventListener("submit", (e) => submitBuilderOrder(e, listEl));
      } catch (err) {
        console.error("Error loading dishes:", err);
        alert(`Error loading dishes.\nBase URL: ${API_BASE}\nDetails: ${err.message}`);
      }
      return;
    }

    // nuova pagina ma senza dishId
    const dishBox = qs("#dish");
    if (dishBox) {
      dishBox.innerHTML = `
        <div>
          <h2>No dish selected</h2>
          <p class="muted">Open a dish and press "Order".</p>
          <p><a href="ricerca_piatti.html">Go to dishes</a></p>
        </div>
      `;
      qs("#order-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        alert("Select a dish first.");
      });
    }
  });
})();
