// login.js
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const router = express.Router();
const User = require("./models/user");

// --- helpers ---
function escRe(s = "") {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function looksLikeBcryptHash(s) {
  return typeof s === "string" && /^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/.test(s);
}

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Gestione utenti e autenticazione
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: thomas@example.com
 *         username:
 *           type: string
 *           example: thomas
 *         password:
 *           type: string
 *           example: mySecret123
 *     LoginResponse:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: true
 *         token:
 *           type: string
 *           description: JWT o token random
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6...
 *         user:
 *           type: object
 *           properties:
 *             _id: { type: string, example: "64f0c2..." }
 *             username: { type: string, example: "thomas" }
 *             email: { type: string, example: "thomas@example.com" }
 *             role: { type: string, example: "ristoratore" }
 *             restaurantId: { type: string, example: "r_o" }
 *             preferenza: { type: string, example: "vegano" }
 *             telefono: { type: string, example: "3456789012" }
 *             luogo: { type: string, example: "Milano" }
 *             partitaIva: { type: string, example: "IT12345678901" }
 *             indirizzo: { type: string, example: "Via Roma 10" }
 *   responses:
 *     Unauthorized:
 *       description: Credenziali non valide
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 example: Credenziali non valide
 *     ValidationError:
 *       description: Richiesta non valida
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 example: email (o username) e password obbligatori
 */

/**
 * @swagger
 * /login:
 *   post:
 *     tags: [Users]
 *     summary: Login con email o username e password
 *     description: Verifica le credenziali e restituisce un token con i dati utente (JWT se configurato, altrimenti token random).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/LoginRequest"
 *     responses:
 *       200:
 *         description: Login riuscito
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/LoginResponse"
 *       400:
 *         $ref: "#/components/responses/ValidationError"
 *       401:
 *         $ref: "#/components/responses/Unauthorized"
 *       500:
 *         description: Errore interno del server
 */
router.post("/login", async (req, res) => {
  try {
    const { email = "", username = "", password = "" } = req.body || {};

    if ((!email && !username) || !password) {
      return res.status(400).json({ message: "email (o username) e password obbligatori" });
    }

    const query = email
      ? { email: new RegExp("^" + escRe(email.trim()) + "$", "i") }
      : { username: new RegExp("^" + escRe(username.trim()) + "$", "i") };

    const user = await User.findOne(query).lean();
    if (!user || !user.password) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    let valid = false;
    if (looksLikeBcryptHash(user.password)) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      try {
        const a = Buffer.from(password, "utf8");
        const b = Buffer.from(String(user.password), "utf8");
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) valid = true;
      } catch {}
      if (!valid && String(user.password) === password) valid = true;
    }

    if (!valid) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    let token;
    try {
      if (process.env.JWT_SECRET) {
        const jwt = require("jsonwebtoken");
        token = jwt.sign(
          { sub: user._id?.toString(), role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
      } else {
        token = crypto.randomBytes(24).toString("hex");
      }
    } catch {
      token = crypto.randomBytes(24).toString("hex");
    }

    const outUser = {
      _id: user._id?.toString() || user.id || "",
      username: user.username || "",
      email: user.email || "",
      role: user.role || "",
      restaurantId: String(user.restaurantId || user.r_o || ""),
      preferenza: user.preferenza ?? "",
      telefono: user.telefono ?? "",
      luogo: user.luogo ?? "",
      partitaIva: user.partitaIva ?? "",
      indirizzo: user.indirizzo ?? "",
    };

    return res.status(200).json({ ok: true, token, user: outUser });
  } catch (err) {
    console.error("Errore login:", err);
    return res.status(500).json({ message: "Errore durante il login" });
  }
});

module.exports = router;
