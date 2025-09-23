// js/order.js — ordine singolo senza carrello (dishId da query)

(function () {
  /* --------- auth: serve un cliente loggato --------- */
  const user = JSON.parse(localStorage.getItem("loggedUser") || "null");
  if (!user || user.role !== "cliente") {
    alert("You must be logged in as a customer to place an order.");
    window.location.href = "login.html";
    throw new Error("User not logged in as customer");
  }

  /* --------- base URL (override da localStorage se serve) --------- */
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const DEFAULT_API_BASE = isLocal
    ? "http://localhost:3000"
    : location.origin;
  const API_BASE = localStorage.getItem("API_BASE") || DEFAULT_API_BASE;

  /* -------------------- helpers UI/DOM -------------------- */
  const qs  = (s) => document.querySelector(s);
  const fmt = (n) => `€${(Number(n || 0)).toFixed(2)}`;
  const getParam = (k) => new URLSearchParams(location.search).get(k) || "";

  function isValidImgPath(s) {
    if (typeof s !== "string") return false;
    const t = s.trim(); if (!t || t === "#" || t === "-") return false;
    return /^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/");
  }
  function firstImage(p) {
    const src = p || {}, raw = src.raw || {};
    const cands = [
      src.immagine, src.foto, src.strMealThumb, src.image, src.thumb, src.picture, src.img,
      raw.immagine, raw.foto, raw.strMealThumb, raw.image, raw.thumb, raw.picture, raw.img
    ];
    for (let c of cands) {
      if (!isValidImgPath(c)) continue;
      c = String(c).trim();
      return c.startsWith("//") ? "https:" + c : c;
    }
    return "";
  }
  function pickImageURL(p) {
    const u = firstImage(p);
    if (isValidImgPath(u)) return u.startsWith("/") ? location.origin + u : u;
    const label = encodeURIComponent((p.nome || p.strMeal || "Food").split(" ")[0]);
    return `https://placehold.co/160x120?text=${label}`;
  }
  function normalizeMeal(raw, restaurantIdFallback) {
    let id = raw.idmeals ?? raw.idMeal ?? raw.id ?? raw._id ?? null;
    if (id != null) id = String(id);

    const name = raw.nome ?? raw.strMeal ?? raw.name ?? "No name";
    const category = raw.tipologia ?? raw.category ?? raw.strCategory ?? "";
    let price = raw.prezzo ?? raw.price ?? 0;
    if (typeof price === "string") {
      const num = Number(price.replace(",", "."));
      price = Number.isFinite(num) ? num : 0;
    }
    const description = raw.descrizione ?? raw.description ?? raw.strInstructions ?? "";
    const restaurantId = raw.restaurantId ?? restaurantIdFallback ?? "";
    const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients.filter(Boolean) : [];

    return { id, name, price: Number(price), category, description, restaurantId, ingredients, raw };
  }

  /* -------------------- stato pagina -------------------- */
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
    qs("#subtotal").textContent = fmt(sub);
    qs("#fees").textContent     = fmt(FEES);
    qs("#total").textContent    = fmt(sub + FEES);
  }

  async function fetchMeals() {
    // prova /meals poi /api/meals
    for (const path of ["/meals", "/api/meals"]) {
      try {
        const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json" } });
        if (res.ok) return await res.json();
      } catch {}
    }
    throw new Error("Cannot load meals from API_BASE");
  }

  async function loadMealById(dishId, restaurantIdHint) {
    const data = await fetchMeals();
    let list = [];

    if (Array.isArray(data) && data.some(r => Array.isArray(r.menu))) {
      // struttura annidata: [{ restaurantId, menu: [...] }, ...]
      for (const r of data) {
        const rid = r.restaurantId ?? r.idRestaurant ?? r.id ?? r._id ?? "";
        for (const m of (r.menu || [])) list.push(normalizeMeal(m, rid));
      }
    } else if (Array.isArray(data)) {
      list = data.map(m => normalizeMeal(m));
    } else {
      // fallback ricorsivo soft
      const stack = [data];
      while (stack.length) {
        const cur = stack.pop();
        if (!cur || typeof cur !== "object") continue;
        if (Array.isArray(cur.menu)) {
          const rid = cur.restaurantId ?? cur.idRestaurant ?? cur.id ?? cur._id ?? "";
          for (const m of (cur.menu || [])) list.push(normalizeMeal(m, rid));
        }
        Object.values(cur).forEach(v => {
          if (v && typeof v === "object") stack.push(v);
          if (Array.isArray(v)) v.forEach(x => x && typeof x === "object" && stack.push(x));
        });
      }
    }

    const found =
      list.find(x => String(x.id) === String(dishId)) ||
      list.find(x => String(x.raw?.idmeals) === String(dishId)) ||
      list.find(x => String(x.raw?._id) === String(dishId));

    if (!found) throw new Error("Dish not found");
    if (restaurantIdHint && !found.restaurantId) found.restaurantId = String(restaurantIdHint);
    return found;
  }

  async function submitOrder(e) {
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
      imageUrl: pickImageURL(currentMeal) // snapshot immagine
    };

    const body = {
      userId: user._id || user.id || user.username || "",
      restaurantId: item.restaurantId,
      items: [item],
      delivery,
      payment,
      subtotal: Number((item.price * qty).toFixed(2)),
      fees: Number(FEES),
      total: Number((item.price * qty + FEES).toFixed(2)),
      status: "ordinato",
      createdAt: new Date().toISOString()
    };

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      alert("Order placed successfully!");
      location.href = "i-miei-ordini.html";
    } catch (err) {
      console.warn("POST /orders failed, fallback local:", err.message);
      const key = "orders_local_fallback";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push(body);
      localStorage.setItem(key, JSON.stringify(arr));
      alert("Order saved locally (offline mode).");
      location.href = "i-miei-ordini.html";
    }
  }

  /* ------------------------ boot ------------------------ */
  window.addEventListener("DOMContentLoaded", async () => {
    const dishId = getParam("dishId");
    const rid    = getParam("restaurantId");

    if (!dishId) {
      qs("#dish").innerHTML = `
        <div>
          <h2>No dish selected</h2>
          <p class="muted">Open a dish and press "Order".</p>
          <p><a href="ricerca_piatti.html">Go to dishes</a></p>
        </div>`;
      const form = qs("#order-form");
      form?.addEventListener("submit", (e) => { e.preventDefault(); alert("Select a dish first."); });
      return;
    }

    try {
      currentMeal = await loadMealById(dishId, rid);
      renderDish();
      renderSummary();
      qs("#order-form")?.addEventListener("submit", submitOrder);
    } catch (e) {
      console.error(e);
      qs("#dish").innerHTML = `
        <div>
          <h2>Dish not available</h2>
        <p class="muted">The selected dish could not be found.</p>
          <p><a href="ricerca_piatti.html">Back to dishes</a></p>
        </div>`;
      qs("#order-form")?.addEventListener("submit", (ev) => ev.preventDefault());
    }
  });
})();
