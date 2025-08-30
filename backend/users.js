// users.js — versione MongoDB (Mongoose)
const express = require("express");
const router = express.Router();
const User = require("./models/User");
const Restaurant = require("./models/Restaurant");

// 🧮 ID numerico incrementale per compatibilità col vecchio frontend
async function nextLegacyId() {
  const last = await User.findOne({ legacyId: { $ne: null } })
    .sort({ legacyId: -1 })
    .select("legacyId")
    .lean();
  return (last?.legacyId || 0) + 1;
}

// ✅ REGISTRAZIONE
router.post("/register", async (req, res) => {
  try {
    const {
      username, email, password, role,
      phone, location, vat, address,
      nome, cognome, pagamento, preferenza
    } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).send("Tutti i campi obbligatori non sono stati forniti.");
    }

    // Username o email già presenti?
    const dup = await User.findOne({ $or: [{ username }, { email }] }).lean();
    if (dup) return res.status(409).send("Username o email già registrati.");

    // legacy id numerico come nel vecchio file JSON
    const legacyId = await nextLegacyId();

    // Se ristoratore, generiamo/colleghiamo un restaurantId
    let restaurantId = null;
    if (role === "ristoratore") {
      restaurantId = `r_${username.toLowerCase().replace(/\s+/g, "")}`;

      // Crea (se non esiste) il documento Restaurant
      const existingR = await Restaurant.findOne({ restaurantId }).lean();
      if (!existingR) {
        await Restaurant.create({
          restaurantId,
          nome: `${username} Ristorante`,
          email,
          telefono: phone || "",
          luogo: location || "",
          partitaIva: vat || "",
          indirizzo: address || ""
        });
      }
    }

    // Crea utente
    const newUser = await User.create({
      legacyId,
      username,
      email,
      password,   // ⚠️ plain-text (puoi passare in seguito a bcrypt)
      role,
      phone: phone || "",
      location: location || "",
      vat: vat || "",
      address: address || "",
      nome: nome || "",
      cognome: cognome || "",
      pagamento: pagamento || "",
      preferenza: preferenza || "",
      restaurantId
    });

    res.status(201).json({ message: "Registrazione completata", user: {
      id: newUser.legacyId,
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      restaurantId: newUser.restaurantId || undefined
    }});
  } catch (err) {
    console.error("Errore registrazione:", err);
    res.status(500).send("Errore durante la registrazione");
  }
});

// ✅ LOGIN (ritorna restaurantId se ristoratore)
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username, password }).lean(); // ⚠️ plain-text
    if (!user) return res.status(401).send("Credenziali non valide");

    // Se ristoratore e non ha restaurantId in user, prova a recuperarlo da Restaurant
    let restaurantId = user.restaurantId || null;
    if (user.role === "ristoratore" && !restaurantId) {
      const r = await Restaurant.findOne({
        $or: [
          { email: user.email },
          { nome: `${user.username} Ristorante` }
        ]
      }).lean();
      if (r) restaurantId = r.restaurantId;
    }

    res.json({
      id: user.legacyId ?? undefined,
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      ...(restaurantId ? { restaurantId } : {})
    });
  } catch (err) {
    console.error("Errore login:", err);
    res.status(500).send("Errore durante il login");
  }
});

// Helper per individuare se l'ID è un ObjectId
function isObjectId(id) {
  return /^[a-f0-9]{24}$/i.test(String(id));
}

// ✅ MODIFICA profilo (compat sia con /users/:id numerico che con /users/:_id Mongo)
router.put("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const filter = isObjectId(param) ? { _id: param } : { legacyId: parseInt(param) };

    const updates = { ...req.body };
    // non permettere di cambiare campi chiave direttamente:
    delete updates._id;
    delete updates.legacyId;
    delete updates.username; // opzionale: rimuovi se vuoi permettere cambio username
    delete updates.role;     // opzionale

    const updated = await User.findOneAndUpdate(filter, { $set: updates }, { new: true });
    if (!updated) return res.status(404).send("Utente non trovato");

    res.json(updated);
  } catch (err) {
    console.error("Errore modifica utente:", err);
    res.status(500).send("Errore durante la modifica");
  }
});

// ✅ CANCELLAZIONE (compat legacyId/_id)
router.delete("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const filter = isObjectId(param) ? { _id: param } : { legacyId: parseInt(param) };

    const deleted = await User.findOneAndDelete(filter);
    if (!deleted) return res.status(404).send("Utente non trovato");

    res.sendStatus(204);
  } catch (err) {
    console.error("Errore cancellazione utente:", err);
    res.status(500).send("Errore durante la cancellazione");
  }
});

// ✅ Lista “ristoratori” (compat con vecchio /users/restaurants)
router.get("/restaurants", async (req, res) => {
  try {
    // Prima fonte: tabella ristoranti dedicata (più ricca e affidabile)
    const restaurants = await Restaurant.find().lean();
    if (restaurants.length) {
      const out = restaurants.map(r => ({
        nome: r.nome,
        location: r.luogo || "",
        telefono: r.telefono || "",
        partitaIVA: r.partitaIva || "",
        restaurantId: r.restaurantId
      }));
      return res.json(out);
    }

    // Fallback: dagli utenti con role="ristoratore"
    const users = await User.find({ role: "ristoratore" }).lean();
    const out = users.map(u => ({
      nome: `${u.username} Ristorante`,
      location: u.location || "",
      telefono: u.phone || "",
      partitaIVA: u.vat || "",
      restaurantId: u.restaurantId || null
    }));
    res.json(out);
  } catch (err) {
    console.error("Errore GET /users/restaurants:", err);
    res.status(500).send("Errore nel recupero ristoratori");
  }
});

module.exports = router;
