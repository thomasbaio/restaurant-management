document.getElementById("role").addEventListener("change", function () {
  const extraRist = document.getElementById("ristoratore-extra");
  const extraCliente = document.getElementById("cliente-extra");

  extraRist.style.display = this.value === "ristoratore" ? "block" : "none";
  extraCliente.style.display = this.value === "cliente" ? "block" : "none";
});

document.getElementById("register-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const data = {
    username: document.getElementById("username").value,
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
    role: document.getElementById("role").value
  };

  if (data.role === "ristoratore") {
    data.vat = document.getElementById("piva").value;
    data.phone = document.getElementById("telefono").value;
    data.location = document.getElementById("luogo").value;
    data.address = document.getElementById("via").value;
  }

  if (data.role === "cliente") {
    data.nome = document.getElementById("nome").value;
    data.cognome = document.getElementById("cognome").value;
    data.pagamento = document.getElementById("pagamento").value;
    data.preferenza = document.getElementById("preferenza").value;
  }

  try {
    const res = await fetch("http://localhost:3000/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      alert("Registrazione completata");
      window.location.href = "login.html";
    } else {
      const error = await res.text();
      alert("Errore: " + error);
    }
  } catch (err) {
    console.error("Errore nella richiesta:", err);
    alert("Errore di rete");
  }
});
