async function cercaPiatti() {
  const nome = document.getElementById("nome").value.toLowerCase();
  const tipologia = document.getElementById("tipologia").value.toLowerCase();
  const prezzo = parseFloat(document.getElementById("prezzo").value);
  const lista = document.getElementById("risultati-piatti");

  lista.innerHTML = "⏳ Caricamento...";

  try {
    const res = await fetch("http://localhost:3000/meals");
    const data = await res.json();
    const piatti = data.flatMap(r => r.menu || []);

    const filtrati = piatti.filter(p => {
      const matchNome = !nome || p.nome?.toLowerCase().includes(nome);
      const matchTipo = !tipologia || p.tipologia?.toLowerCase().includes(tipologia);
      const matchPrezzo = isNaN(prezzo) || p.prezzo <= prezzo;
      return matchNome && matchTipo && matchPrezzo;
    });

    if (filtrati.length === 0) {
      lista.innerHTML = "<li>Nessun piatto trovato.</li>";
    } else {
      lista.innerHTML = filtrati.map(p => `
        <li>
          <strong>${p.nome}</strong><br>
          🍽️ ${p.tipologia || "-"}<br>
          💶 €${p.prezzo.toFixed(2)}<br>
          🧂 ${Array.isArray(p.ingredients) ? p.ingredients.join(", ") : ""}
        </li>
      `).join("");
    }

  } catch (err) {
    console.error("Errore:", err);
    lista.innerHTML = "<li>⚠️ Errore durante la ricerca.</li>";
  }
}
