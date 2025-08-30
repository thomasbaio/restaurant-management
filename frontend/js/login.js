document.getElementById("login-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const res = await fetch("http://localhost:3000/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const errText = await res.text();
      alert("Errore: " + errText);
      return;
    }

    const data = await res.json();
    localStorage.setItem("loggedUser", JSON.stringify(data));
    alert("Login effettuato con successo!");
    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    alert("Errore di rete");
  }
});

