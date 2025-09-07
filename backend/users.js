const express = require("express");
const router = express.Router();
const User = require("./models/user");
const Restaurant = require("./models/restaurant");

// id numerico incrementale per compatibilità col vecchio frontend
async function nextLegacyId() {
  const last = await User.findOne({ legacyId: { $ne: null } })
    .sort({ legacyId: -1 })
    .select("legacyId")
    .lean();
  return (last?.legacyId || 0) + 1;
}

// helper: normalizza i campi tra vecchi e nuovi nomi
function normalizeBody(b) {
  return {
    username: b.username,
    email: b.email,
    password: b.password,
    role: b.role,

    // accetta entrambe le versioni dei nomi
    telefono: b.telefono ?? b.phone ?? "",
    luogo: b.luogo ?? b.location ?? "",
    partitaIva: b.partitaIva ?? b.vat ?? "",
    indirizzo: b.indirizzo ?? b.address ?? "",

    nome: b.nome ?? "",
    cognome: b.cognome ?? "",
    pagamento: b.pagamento ?? "",
    preferenza: b.preferenza ?? ""
  };
}

// registrazione
router.post("/register", async (req, res) => {
  try {
    const body = normalizeBody(req.body);
    const { username, email, password, role } = body;

    if (!username || !email || !password || !role) {
      return res.status(400).send("All required fields have not been provided.");
    }

    // username o email già presenti?
    const dup = await User.findOne({ $or: [{ username }, { email }] }).lean();
    if (dup) return res.status(409).send("Username or email already registered.");

    // legacy id numerico come nel vecchio file JSON
    const legacyId = await nextLegacyId();

    // prepara restaurantId solo per ristoratore
    let restaurantId = null;
    if (role === "ristoratore") {
      restaurantId = `r_${username.toLowerCase().replace(/\s+/g, "")}`;
    }

    // crea utente (password in chiaro come nel tuo file attuale)
    const newUser = await User.create({
      legacyId,
      username,
      email,
      password,
      role,
      telefono: role === "ristoratore" ? body.telefono : "",
      luogo: role === "ristoratore" ? body.luogo : "",
      partitaIva: role === "ristoratore" ? body.partitaIva : "",
      indirizzo: role === "ristoratore" ? (typeof body.indirizzo === "string" ? body.indirizzo : (body.indirizzo?.via ?? "")) : "",
      nome: body.nome,
      cognome: body.cognome,
      pagamento: body.pagamento,
      preferenza: body.preferenza,
      restaurantId
    });

    // se è ristoratore, prova a creare/aggiornare il Restaurant in modo compatibile con il suo schema
    if (role === "ristoratore") {
      try {
        // se il tuo Restaurant richiede ownerUserId e indirizzo oggetto, li forniamo qui
        const indirizzoObj =
          typeof body.indirizzo === "object" && body.indirizzo !== null
            ? body.indirizzo
            : { via: body.indirizzo || "" };

        // upsert: se esiste con restaurantId lo aggiorno, altrimenti lo creo
        await Restaurant.findOneAndUpdate(
          { restaurantId },
          {
            $set: {
              ownerUserId: newUser._id,                  // <-- requisito del tuo schema
              restaurantId,
              nome: `${username} Ristorante`,
              email,
              telefono: body.telefono || "",
              luogo: body.luogo || "",
              partitaIva: body.partitaIva || "",
              indirizzo: indirizzoObj                    // <-- oggetto, non stringa
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (errR) {
        // non blocco la registrazione se fallisce la creazione del Restaurant
        console.error("  Restaurant creation/update failed:", errR?.message);
      }
    }

    res.status(201).json({
      message: "Registration completed",
      user: {
        id: newUser.legacyId,
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        restaurantId: newUser.restaurantId || undefined
      }
    });
  } catch (err) {
    console.error("Error registration:", err);
    res.status(500).send("Error during recording");
  }
});

// login (ritorna restaurantId se ristoratore)
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // plain-text (coerente col tuo attuale salvataggio)
    const user = await User.findOne({ username, password }).lean();
    if (!user) return res.status(401).send("Invalid credentials");

    // se ristoratore e non ha restaurantId in user, prova a recuperarlo da Restaurant
    let restaurantId = user.restaurantId || null;
    if (user.role === "ristoratore" && !restaurantId) {
      const r = await Restaurant.findOne({
        $or: [{ ownerUserId: user._id }, { email: user.email }, { nome: `${user.username} Ristorante` }]
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
    console.error("Error login:", err);
    res.status(500).send("Error during the login");
  }
});

// helper per individuare se l'ID è un ObjectId
function isObjectId(id) {
  return /^[a-f0-9]{24}$/i.test(String(id));
}

// modifica profilo (compat sia con /users/:id numerico che con /users/:_id Mongo)
router.put("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const filter = isObjectId(param) ? { _id: param } : { legacyId: parseInt(param) };

    const body = normalizeBody(req.body);
    const updates = { ...body };

    // non permettere di cambiare campi chiave direttamente:
    delete updates._id;
    delete updates.legacyId;
    delete updates.username; // opzionale: rimuovi se vuoi permettere cambio username
    delete updates.role;     // opzionale
    delete updates.password; // evita di sovrascrivere per sbaglio

    const updated = await User.findOneAndUpdate(filter, { $set: updates }, { new: true });
    if (!updated) return res.status(404).send("Utente not found");

    res.json(updated);
  } catch (err) {
    console.error("error while editing:", err);
    res.status(500).send("error while editing");
  }
});

// cancellazione (compat legacyId/_id)
router.delete("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const filter = isObjectId(param) ? { _id: param } : { legacyId: parseInt(param) };

    const deleted = await User.findOneAndDelete(filter);
    if (!deleted) return res.status(404).send("Utente not found");

    res.sendStatus(204);
  } catch (err) {
    console.error("User deletion error:", err);
    res.status(500).send("Error while deleting");
  }
});

// lista “ristoratori” (compat con vecchio /users/restaurants)
router.get("/restaurants", async (req, res) => {
  try {
    // preferisci la tabella ristoranti dedicata (più completa)
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

    // fallback: dagli utenti con role="ristoratore"
    const users = await User.find({ role: "ristoratore" }).lean();
    const out = users.map(u => ({
      nome: `${u.username} Ristorante`,
      location: u.luogo || "",
      telefono: u.telefono || "",
      partitaIVA: u.partitaIva || "",
      restaurantId: u.restaurantId || null
    }));
    res.json(out);
  } catch (err) {
    console.error("Error GET /users/restaurants:", err);
    res.status(500).send("Error in restaurateur recovery");
  }
});

module.exports = router;
