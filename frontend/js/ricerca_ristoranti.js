async function cercaRistoranti() {
  const nome = document.getElementById("nome").value.toLowerCase();
  const luogo = document.getElementById("luogo").value.toLowerCase();
  const lista = document.getElementById("risultati-ristoranti");
  lista.innerHTML = "⏳ Caricamento...";

  try {
    const res = await fetch("http://localhost:3000/users/restaurants");
    const ristoranti = await res.json();

    const filtrati = ristoranti.filter(r => {
      const matchNome = nome === "" || r.nome.toLowerCase().includes(nome);
      const matchLuogo = luogo === "" || r.location?.toLowerCase().includes(luogo);  // ✅ usa `location`
      return matchNome && matchLuogo;
    });

    if (filtrati.length === 0) {
      lista.innerHTML = "<li>Nessun ristorante trovato.</li>";
    } else {
      lista.innerHTML = filtrati.map(r => `
        <li>
          <strong>${r.nome}</strong><br>
          📍 ${r.location || "N/D"}<br>
          ☎️ ${r.telefono || "N/D"}<br>
          🧾 P.IVA: ${r.partitaIVA || "N/D"}
        </li>
      `).join("");
    }

  } catch (err) {
    console.error("Errore nella ricerca:", err);
    lista.innerHTML = "<li>⚠️ Errore durante la ricerca dei ristoranti.</li>";
  }
}
