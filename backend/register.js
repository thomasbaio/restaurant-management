// register.js — versione MongoDB
const express = require("express");
const router = express.Router();
const User = require("./models/User"); // 👉 modello Mongoose User

// ✅ Registrazione utente
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, role, telefono, partitaIva, indirizzo } = req.body;

    // Controlla se username già esiste
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).send("Utente già registrato");
    }

    // Crea nuovo utente
    const newUser = new User({
      username,
      email,
      password,
      role,
      telefono,
      partitaIva,
      indirizzo,
      restaurantId: role === "ristoratore" ? `r_${Date.now()}` : null // id univoco per ristoratori
    });

    await newUser.save();
    res.status(201).send("Registrazione completata");
  } catch (err) {
    console.error("Errore registrazione:", err);
    res.status(500).send("Errore durante la registrazione");
  }
});

module.exports = router;