// user.js
const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const User = require("./models/user");
const Restaurant = require("./models/restaurant");

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Gestione utenti (rotte legacy /users/*). Preferisci le rotte moderne /register e /login.
 */

// id numerico incrementale per compatibilità col vecchio frontend
async function nextLegacyId() {
  const last = await User.findOne({ legacyId: { $ne: null } })
    .sort({ legacyId: -1 })
    .select("legacyId")
    .lean();
  return (last?.legacyId || 0) + 1;
}

// helper: normalizza i campi tra vecchi e nuovi nomi
function normalizeBody(b = {}) {
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
    preferenza: b.preferenza ?? "",
  };
}
const isObjectId = (id) => /^[a-f0-9]{24}$/i.test(String(id));

/* ================== LISTA & DETTAGLIO ================== */

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users, fetch]
 *     summary: Lista utenti
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [cliente, ristoratore] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: filtro su username/email
 *     responses:
 *       200:
 *         description: Elenco utenti
 */
router.get("/", async (req, res) => {
  try {
    const { role, q } = req.query || {};
    const and = [];
    if (role) and.push({ role });
    if (q) {
      const rx = new RegExp(String(q), "i");
      and.push({ $or: [{ username: rx }, { email: rx }] });
    }
    const filter = and.length ? { $and: and } : {};
    const users = await User.find(filter).select("-password").lean();
    res.json(users);
  } catch (err) {
    console.error("GET /users error:", err);
    res.status(500).json({ message: "Error loading users" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Dettaglio utente (legacyId o _id)
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     responses:
 *       200: { description: Ok }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const filter = isObjectId(param) ? { _id: param } : { legacyId: Number(param) };
    const u = await User.findOne(filter).select("-password").lean();
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json(u);
  } catch (err) {
    console.error("GET /users/:id error:", err);
    res.status(500).json({ message: "Error loading user" });
  }
});

/* ================== LEGACY REGISTER/LOGIN ================== */

/**
 * @swagger
 * /users/register:
 *   post:
 *     tags: [Users]
 *     summary: (DEPRECATA) Registrazione legacy via /users/register
 *     deprecated: true
 *     description: Preferisci **POST /register**. Questa rotta resta per compatibilità e salva la password con **bcrypt**. Se role="ristoratore", crea/aggiorna anche un ristorante minimale.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/User'
 *             required: [username, email, password, role]
 *     responses:
 *       201: { description: Utente creato (legacy) }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409:
 *         description: Username o email già registrati
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post("/register", async (req, res) => {
  try {
    const body = normalizeBody(req.body);
    let { username, email, password, role } = body;
    if (!username || !email || !password || !role) {
      return res.status(400).json({ message: "username, email, password e role sono obbligatori" });
    }

    email = String(email).trim().toLowerCase();
    role = String(role).trim();

    const dup = await User.findOne({ $or: [{ username }, { email }] }).lean();
    if (dup) return res.status(409).json({ message: "Username o email già registrati" });

    const legacyId = await nextLegacyId();

    let restaurantId = null;
    if (role === "ristoratore") {
      restaurantId = `r_${username.toLowerCase().replace(/\s+/g, "")}`;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const newUser = await User.create({
      legacyId,
      username,
      email,
      password: passwordHash,
      role,
      telefono: role === "ristoratore" ? body.telefono : "",
      luogo: role === "ristoratore" ? body.luogo : "",
      partitaIva: role === "ristoratore" ? body.partitaIva : "",
      indirizzo:
        role === "ristoratore"
          ? typeof body.indirizzo === "string"
            ? body.indirizzo
            : body.indirizzo?.via ?? ""
          : "",
      nome: body.nome,
      cognome: body.cognome,
      pagamento: body.pagamento,
      preferenza: body.preferenza,
      restaurantId,
    });

    if (role === "ristoratore") {
      try {
        const indirizzoObj =
          typeof body.indirizzo === "object" && body.indirizzo !== null
            ? body.indirizzo
            : { via: body.indirizzo || "" };

        await Restaurant.findOneAndUpdate(
          { restaurantId },
          {
            $set: {
              ownerUserId: newUser._id,
              restaurantId,
              nome: `${username} Ristorante`,
              email,
              telefono: body.telefono || "",
              luogo: body.luogo || "",
              partitaIva: body.partitaIva || "",
              indirizzo: indirizzoObj,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (errR) {
        console.error("Restaurant creation/update failed:", errR?.message);
      }
    }

    return res.status(201).json({
      message: "Registration completed (legacy)",
      user: {
        id: newUser.legacyId,
        _id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        restaurantId: newUser.restaurantId || undefined,
      },
    });
  } catch (err) {
    console.error("Error registration (legacy):", err);
    res.status(500).json({ message: "Error during recording" });
  }
});

/**
 * @swagger
 * /users/login:
 *   post:
 *     tags: [Users]
 *     summary: (DEPRECATA) Login legacy via /users/login
 *     deprecated: true
 *     description: Preferisci **POST /login**. Accetta email **o** username e password (hash Bcrypt).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [email, password]
 *                 properties:
 *                   email: { type: string, format: email }
 *                   password: { type: string }
 *               - type: object
 *                 required: [username, password]
 *                 properties:
 *                   username: { type: string }
 *                   password: { type: string }
 *     responses:
 *       200:
 *         description: Dati utente (legacy). Usa /login per avere anche il token.
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Errore interno
 */
router.post("/login", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if ((!username && !email) || !password) {
      return res.status(400).json({ message: "email (o username) e password sono obbligatori" });
    }

    const query = email
      ? { email: String(email).trim().toLowerCase() }
      : { username: String(username).trim() };

    const user = await User.findOne(query).lean();
    if (!user || !user.password) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    // se ristoratore e non ha restaurantId in user, prova a recuperarlo da Restaurant
    let restaurantId = user.restaurantId || null;
    if (user.role === "ristoratore" && !restaurantId) {
      const r = await Restaurant.findOne({
        $or: [{ ownerUserId: user._id }, { email: user.email }, { nome: `${user.username} Ristorante` }],
      }).lean();
      if (r) restaurantId = r.restaurantId;
    }

    return res.json({
      id: user.legacyId ?? undefined,
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      ...(restaurantId ? { restaurantId } : {}),
    });
  } catch (err) {
    console.error("Error login (legacy):", err);
    res.status(500).json({ message: "Error during the login" });
  }
});

/* ================== UPDATE / DELETE ================== */

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Aggiorna profilo/ristoratore (legacyId o _id)
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/User' }
 *     responses:
 *       200: { description: Utente aggiornato }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       500: { description: Errore interno }
 */
router.put("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const n = Number(param);
    const filter = isObjectId(param) ? { _id: param } : Number.isFinite(n) ? { legacyId: n } : null;
    if (!filter) return res.status(400).json({ message: "id non valido" });

    const body = normalizeBody(req.body);
    const updates = { ...body };

    // non permettere di cambiare campi chiave direttamente:
    delete updates._id;
    delete updates.legacyId;
    delete updates.username; // rimuovi se vuoi permettere cambio username
    delete updates.role;     // rimuovi se vuoi permettere cambio ruolo
    delete updates.password; // per cambio password crea una rotta dedicata

    const updated = await User.findOneAndUpdate(filter, { $set: updates }, { new: true })
      .select("-password")
      .lean();
    if (!updated) return res.status(404).json({ message: "Utente not found" });

    res.json(updated);
  } catch (err) {
    console.error("error while editing:", err);
    res.status(500).json({ message: "error while editing" });
  }
});

/**
 * @swagger
 * /users/{id}/password:
 *   put:
 *     tags: [Users]
 *     summary: Cambia password (legacyId o _id)
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, example: "Nu0v@P4ss!" }
 *     responses:
 *       204: { description: Password aggiornata }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put("/:id/password", async (req, res) => {
  try {
    const param = String(req.params.id);
    const n = Number(param);
    const filter = isObjectId(param) ? { _id: param } : Number.isFinite(n) ? { legacyId: n } : null;
    if (!filter) return res.status(400).json({ message: "id non valido" });

    const { password } = req.body || {};
    if (!password) return res.status(400).json({ message: "password obbligatoria" });

    const hash = await bcrypt.hash(String(password), 10);
    const updated = await User.findOneAndUpdate(filter, { $set: { password: hash } }, { new: true });
    if (!updated) return res.status(404).json({ message: "Utente not found" });

    res.sendStatus(204);
  } catch (err) {
    console.error("PUT /users/:id/password error:", err);
    res.status(500).json({ message: "Error updating password" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Cancella account (legacyId o _id)
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     responses:
 *       204: { description: Cancellato }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       500: { description: Errore interno }
 */
router.delete("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const n = Number(param);
    const filter = isObjectId(param) ? { _id: param } : Number.isFinite(n) ? { legacyId: n } : null;
    if (!filter) return res.status(400).json({ message: "id non valido" });

    const deleted = await User.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ message: "Utente not found" });

    res.sendStatus(204);
  } catch (err) {
    console.error("User deletion error:", err);
    res.status(500).json({ message: "Error while deleting" });
  }
});

/**
 * @swagger
 * /users/restaurants:
 *   get:
 *     tags: [Users, fetch]
 *     summary: Lista ristoratori (compat)
 *     responses:
 *       200:
 *         description: Elenco ristoranti/ristoratori
 */
router.get("/restaurants", async (req, res) => {
  try {
    // preferisci la tabella ristoranti dedicata (più completa)
    const restaurants = await Restaurant.find().lean();
    if (restaurants.length) {
      const out = restaurants.map((r) => ({
        nome: r.nome,
        location: r.luogo || "",
        telefono: r.telefono || "",
        partitaIVA: r.partitaIva || "",
        restaurantId: r.restaurantId,
      }));
      return res.json(out);
    }

    // fallback: dagli utenti con role="ristoratore"
    const users = await User.find({ role: "ristoratore" }).lean();
    const out = users.map((u) => ({
      nome: `${u.username} Ristorante`,
      location: u.luogo || "",
      telefono: u.telefono || "",
      partitaIVA: u.partitaIva || "",
      restaurantId: u.restaurantId || null,
    }));
    res.json(out);
  } catch (err) {
    console.error("Error GET /users/restaurants:", err);
    res.status(500).json({ message: "Error in restaurateur recovery" });
  }
});

module.exports = router;
