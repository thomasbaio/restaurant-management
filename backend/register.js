// register.js
const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const User = require("./models/user");

/**
 * @swagger
 * /register:
 *   post:
 *     tags: [Users]
 *     summary: Registrazione nuovo utente (cliente o ristoratore)
 *     description: Crea un utente. Se il ruolo è "ristoratore", assegna anche un `restaurantId` e accetta i campi anagrafici del ristorante.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/User'
 *             required: [username, email, password]
 *           examples:
 *             cliente:
 *               value:
 *                 username: "thomas"
 *                 email: "thomas@example.com"
 *                 password: "mySecret123"
 *                 role: "cliente"
 *                 preferenza: "pizza"
 *             ristoratore:
 *               value:
 *                 username: "pizzeria_mario"
 *                 email: "mario@example.com"
 *                 password: "superSegreta"
 *                 role: "ristoratore"
 *                 telefono: "+39 333 1234567"
 *                 partitaIva: "IT12345678901"
 *                 indirizzo: "Via Roma 1"
 *                 luogo: "Milano"
 *                 restaurantName: "Pizzeria Da Mario"
 *     responses:
 *       201:
 *         description: Registrazione completata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Registrazione completata" }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: "66f1b3c1a2e4e9a1c9b0d123" }
 *                     username: { type: string, example: "thomas" }
 *                     email: { type: string, example: "thomas@example.com" }
 *                     role: { type: string, example: "cliente" }
 *                     restaurantId: { type: string, nullable: true, example: null }
 *                     preferenza: { type: string, nullable: true, example: "pizza" }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Email o username già registrati
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             examples:
 *               duplicato:
 *                 value: { message: "email già registrata" }
 *       500:
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post("/register", async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      role: roleRaw,
      telefono,
      partitaIva,
      indirizzo,
      luogo,
      restaurantName,
      restaurantId: restaurantIdFromBody,

      // alias preferenza
      preferenza,
      preferredCategory,
      favoriteCategory,
    } = req.body || {};

    // 1) validazione minima
    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email e password sono obbligatori" });
    }

    const role = (roleRaw || "cliente").toString().trim();
    if (!["cliente", "ristoratore"].includes(role)) {
      return res.status(400).json({ message: "role non valido: usa 'cliente' o 'ristoratore'" });
    }

    const emailNorm = String(email).trim().toLowerCase();

    // 2) unicità username/email
    const existing = await User.findOne({ $or: [{ username }, { email: emailNorm }] }).lean();
    if (existing) {
      const field = existing.username === username ? "username" : "email";
      return res.status(409).json({ message: `${field} già registrata` });
    }

    // 3) hash password
    const passwordHash = await bcrypt.hash(String(password), 10);

    // 4) dati ristoratore (se applicabile)
    let restaurant = undefined;
    let restaurantId = null;
    if (role === "ristoratore") {
      restaurantId = restaurantIdFromBody || `r_${Date.now()}`;
      restaurant = {
        restaurantId,
        nome: restaurantName || "",
        telefono: telefono || "",
        partitaIva: partitaIva || "",
        indirizzo: indirizzo || "",
        luogo: luogo || "",
      };
    }

    // 5) preferenza cliente (accetta alias)
    const prefRaw = (preferenza ?? preferredCategory ?? favoriteCategory ?? "").toString().trim();
    const userPreference = role === "cliente" && prefRaw ? prefRaw : undefined;

    // 6) crea utente
    const newUser = await User.create({
      username,
      email: emailNorm,
      password: passwordHash,
      role,
      telefono: role === "ristoratore" ? telefono : undefined,
      partitaIva: role === "ristoratore" ? partitaIva : undefined,
      indirizzo: role === "ristoratore" ? indirizzo : undefined,
      luogo: role === "ristoratore" ? luogo : undefined,
      restaurantId,
      restaurant,
      preferenza: userPreference,
    });

    // 7) risposta (senza password)
    return res.status(201).json({
      message: "Registrazione completata",
      user: {
        id: newUser._id.toString(),
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        restaurantId: newUser.restaurantId || null,
        preferenza: newUser.preferenza || null,
      },
    });
  } catch (err) {
    console.error("Errore registrazione:", err);
    return res.status(500).json({ message: "Errore durante la registrazione" });
  }
});

module.exports = router;
