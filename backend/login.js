// login.js
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const router = express.Router();
const User = require("./models/user");

/**
 * @swagger
 * /login:
 *   post:
 *     tags: [Users]
 *     summary: Login con email (o username) e password
 *     description: Verifica le credenziali e restituisce un token e i dati utente. Se è presente `JWT_SECRET` e la libreria `jsonwebtoken`, il token sarà un JWT; altrimenti verrà generato un token random.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/LoginRequest" }
 *           examples:
 *             byEmail:
 *               value: { email: "thomas@example.com", password: "mySecret123" }
 *             byUsername:
 *               value: { username: "thomas", password: "mySecret123" }
 *     responses:
 *       200:
 *         description: Token e dati utente
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/LoginResponse" }
 *       400:
 *         $ref: "#/components/responses/ValidationError"
 *       401:
 *         $ref: "#/components/responses/Unauthorized"
 *       500:
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Error" }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, username, password } = req.body || {};

    if ((!email && !username) || !password) {
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

    // --- genera token: preferisci JWT se disponibile ---
    let token;
    try {
      if (process.env.JWT_SECRET) {
        const jwt = require("jsonwebtoken"); // usa solo se installato
        token = jwt.sign(
          { sub: user._id.toString(), role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
      } else {
        token = crypto.randomBytes(24).toString("hex"); // fallback token random
      }
    } catch {
      token = crypto.randomBytes(24).toString("hex");
    }

    // costruisci payload utente da ritornare (senza password)
    const outUser = {
      id: user._id?.toString?.() || user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId ?? null,
      preferenza: user.preferenza ?? null,
    };

    return res.status(200).json({ token, user: outUser });
  } catch (err) {
    console.error("Errore login:", err);
    return res.status(500).json({ message: "Errore durante il login" });
  }
});

module.exports = router;
