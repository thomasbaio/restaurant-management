// base URL per API: locale vs produzione
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = isLocal ? "http://localhost:3000" : location.origin;

// normalizza i campi dei piatti da sorgenti diverse
function normalizeMeal(m) {
  const nome = m.nome ?? m.strMeal ?? m.name ?? "";
  const tipologia = m.tipologia ?? m.strCategory ?? m.category ?? "";
  const prezzoRaw = m.prezzo ?? m.price ?? m.cost ?? null;
  const prezzo = prezzoRaw === null ? null : Number(prezzoRaw);
  const foto = m.foto ?? m.strMealThumb ?? m.image ?? "";
  const ingredienti = Array.isArray(m.ingredienti) ? m.ingredienti
                    : Array.isArray(m.ingredients) ? m.ingredients
                    : [];

  return { nome, tipologia, prezzo, foto, ingredienti, _raw: m };
}

// utility per testo incluso (case-insensitive)
function includesCI(hay, needle) {
  if (!needle) return true;
  if (!hay) return false;
  return String(hay).toLowerCase().includes(String(needle).toLowerCase());
}

// Espongo la funzione globalmente per l'onclick inline
window.cercaPiatti = async function cercaPiatti() {
  const ul = document.getElementById("risultati-piatti");
  ul.innerHTML = "<li> Searching...</li>";

  const qNome = document.getElementById("nome").value.trim();
  const qTipo = document.getElementById("tipologia").value.trim();
  const qPrezzoMaxStr = document.getElementById("prezzo").value.trim();
  const qPrezzoMax = qPrezzoMaxStr ? Number(qPrezzoMaxStr) : null;

  try {
    // /meals ritorna array di ristoranti con menu annidato
    const res = await fetch(`${API_BASE}/meals`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // flatten dei piatti
    const allMeals = (Array.isArray(data) ? data : [])
      .flatMap(r => Array.isArray(r.menu) ? r.menu : [])
      .map(normalizeMeal);

    // filtri
    const filtered = allMeals.filter(p => {
      if (!includesCI(p.nome, qNome)) return false;
      if (!includesCI(p.tipologia, qTipo)) return false;
      if (qPrezzoMax !== null && Number.isFinite(p.prezzo) && p.prezzo > qPrezzoMax) return false;
      return true;
    });

    if (!filtered.length) {
      ul.innerHTML = "<li>No dishes found.</li>";
      return;
    }

    ul.innerHTML = "";
    filtered.forEach(p => {
      const li = document.createElement("li");
      li.style.marginBottom = "10px";

      li.innerHTML = `
        <div style="display:flex; gap:10px; align-items:flex-start;">
          ${p.foto ? `<img src="${p.foto}" alt="${p.nome}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;">` : ""}
          <div>
            <strong>${p.nome || "No name"}</strong><br>
            ${p.tipologia ? `<em>${p.tipologia}</em><br>` : ""}
            ${Number.isFinite(p.prezzo) ? `Price: €${p.prezzo.toFixed(2)}<br>` : ""}
            ${p.ingredienti?.length ? `Ingredients: ${p.ingredienti.join(", ")}` : ""}
          </div>
        </div>
      `;
      ul.appendChild(li);
    });

  } catch (err) {
    console.error("Dish search error:", err);
    ul.innerHTML = `<li style="color:#b00;">Error during search. see console for details.</li>`;
  }
};
