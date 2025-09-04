// Base URL: localhost in dev, Render in produzione
const API_BASE =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://restaurant-management-wzhj.onrender.com';

async function cercaPiatti() {
  const nome       = (document.getElementById("nome")?.value || "").toLowerCase();
  const tipologia  = (document.getElementById("tipologia")?.value || "").toLowerCase();
  const prezzo     = parseFloat(document.getElementById("prezzo")?.value);
  const lista      = document.getElementById("risultati-piatti");

  lista.innerHTML = "⏳ Caricamento...";

  try {
    const res = await fetch(`${API_BASE}/meals`);
    const txt = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${txt || 'Errore nel fetch'}`);
    const data = JSON.parse(txt);

    const piatti = data.flatMap(r => r.menu || []);

    const filtrati = piatti.filter(p => {
      const nomeP  = (p.nome || p.name || "").toLowerCase();
      const tipoP  = (p.tipologia || p.category || "").toLowerCase();
      const prezzoP = Number(p.prezzo);

      const matchNome   = !nome || nomeP.includes(nome);
      const matchTipo   = !tipologia || tipoP.includes(tipologia);
      const matchPrezzo = isNaN(prezzo) || (!isNaN(prezzoP) && prezzoP <= prezzo);
      return matchNome && matchTipo && matchPrezzo;
    });

    if (filtrati.length === 0) {
      lista.innerHTML = "<li>Nessun piatto trovato.</li>";
    } else {
      lista.innerHTML = filtrati.map(p => {
        const price = !isNaN(Number(p.prezzo)) ? Number(p.prezzo).toFixed(2) : "-";
        const ingr  = Array.isArray(p.ingredients)
          ? p.ingredients.join(", ")
          : (p.ingredients ? String(p.ingredients) : "");
        return `
          <li>
            <strong>${p.nome || p.name}</strong><br>
            🍽️ ${p.tipologia || p.category || "-"}<br>
            💶 €${price}<br>
            🧂 ${ingr}
          </li>
        `;
      }).join("");
    }

  } catch (err) {
    console.error("Errore:", err);
    lista.innerHTML = `<li>⚠️ ${err.message || "Errore durante la ricerca."}</li>`;
  }
}
