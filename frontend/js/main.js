window.onload = async () => {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  const isRistoratore = user && user.role === "ristoratore";

  const linkAdd = document.getElementById("link-add");
  if (linkAdd && !isRistoratore) {
    linkAdd.style.display = "none";
  }

  if (isRistoratore && (!user.restaurantId || user.restaurantId === "")) {
    alert("Errore: il tuo profilo ristoratore non ha un restaurantId associato.");
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/meals");
    const allData = await res.json();

    let piattiDaMostrare = [];

    if (isRistoratore) {
      const ristorante = allData.find(r => String(r.restaurantId) === String(user.restaurantId));
      if (!ristorante) {
        alert(`Errore: nessun menu trovato per il tuo restaurantId (${user.restaurantId}).`);
        return;
      }
      piattiDaMostrare = ristorante.menu || [];
    } else {
      piattiDaMostrare = allData.flatMap(r => r.menu || []);
    }

    window.__tuttiIPiatti = piattiDaMostrare;

    renderTable(piattiDaMostrare, isRistoratore);

    if (user && user.role === "cliente") {
      const preferenza = user.preferenza;
      const offerteContainer = document.getElementById("offerte-speciali");

      if (!preferenza || preferenza === "") {
        offerteContainer.innerHTML = "<li>Nessuna preferenza selezionata.</li>";
      } else {
        const piattiConsigliati = allData.flatMap(r => r.menu || [])
          .filter(p => p.tipologia?.toLowerCase() === preferenza.toLowerCase());

        if (piattiConsigliati.length === 0) {
          offerteContainer.innerHTML = `<li>Nessun piatto trovato per la categoria "${preferenza}".</li>`;
        } else {
          offerteContainer.innerHTML = piattiConsigliati.map(p => `
            <li style="margin-bottom: 10px;">
              <img src="${p.immagine?.startsWith('http') ? p.immagine : 'https://via.placeholder.com/80'}" 
                   alt="Foto" width="80" style="vertical-align: middle; margin-right: 10px;">
              <strong>${p.nome}</strong> - €${p.prezzo?.toFixed(2) || "n.d."} (${p.tipologia})
            </li>
          `).join("");
        }
      }

      const filtroInput = document.getElementById("filtro-ingrediente");
      if (filtroInput) {
        filtroInput.addEventListener("input", () => {
          const testo = filtroInput.value.trim().toLowerCase();
          const filtrati = window.__tuttiIPiatti.filter(p =>
            (p.ingredients || []).some(i => i.toLowerCase().includes(testo))
          );
          renderTable(filtrati, false);
        });
      }
    }

  } catch (err) {
    console.error(err);
    alert("Errore nel caricamento del menu");
  }
};

// 🧩 Rendering tabella piatti
function renderTable(piatti, isRistoratore) {
  const tbody = document.getElementById("menu-body");
  tbody.innerHTML = "";

  if (!piatti || piatti.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Nessun piatto trovato</td></tr>';
    return;
  }

  piatti.forEach(piatto => {
    const tr = document.createElement("tr");
    const ingredientiList = Array.isArray(piatto.ingredients) ? piatto.ingredients : [];

    const imgHTML = piatto.immagine && piatto.immagine.startsWith("http")
      ? `<img src="${piatto.immagine}" width="80" alt="Foto">`
      : "-";

    const eliminaHTML = isRistoratore && piatto.idmeals
      ? `<button>Elimina</button>`
      : "";

    tr.innerHTML = `
      <td>${piatto.nome}</td>
      <td>${piatto.prezzo.toFixed(2)} €</td>
      <td>${piatto.tipologia || "-"}</td>
      <td>${ingredientiList.join(", ")}</td>
      <td>${imgHTML}</td>
      <td>${eliminaHTML}</td>
    `;

    const deleteButton = tr.querySelector("button");
    if (isRistoratore && piatto.idmeals && deleteButton) {
      deleteButton.addEventListener("click", () => rimuovi(piatto.idmeals));
    }

    tbody.appendChild(tr);
  });
}

// ❌ Elimina piatto (ristoratore)
async function rimuovi(id) {
  const user = JSON.parse(localStorage.getItem("loggedUser"));
  if (!user || !user.restaurantId) return;

  const conferma = confirm("Vuoi davvero eliminare questo piatto?");
  if (!conferma) return;

  try {
    const res = await fetch(`http://localhost:3000/meals/${user.restaurantId}/${id}`, {
      method: "DELETE"
    });
    if (res.ok) window.location.reload();
    else alert("Errore nella rimozione del piatto");
  } catch (err) {
    console.error(err);
    alert("Errore di rete");
  }
}
