// login.js
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const router = express.Router();
const User = require("./models/user");

// util: escape per regex
function escRe(s = "") {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// util: rileva se una stringa "sembra" un hash bcrypt
function looksLikeBcryptHash(s) {
  return typeof s === "string" && /^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/.test(s);
}

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
    const body = req.body || {};
    const email = (body.email || "").trim();
    const username = (body.username || "").trim();
    const password = (body.password || "").trim();

    if ((!email && !username) || !password) {
      return res.status(400).json({ message: "email (o username) e password sono obbligatori" });
    }

    // ricerca case-insensitive: se passo email, cerco per email; se passo username, cerco per username;
    // se volessi massima tolleranza potrei cercare su entrambi.
    const query = email
      ? { email: new RegExp("^" + escRe(email) + "$", "i") }
      : { username: new RegExp("^" + escRe(username) + "$", "i") };

    const user = await User.findOne(query).lean();
    if (!user || !user.password) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    // verifica password:
    // - se è un hash bcrypt, uso bcrypt.compare
    // - altrimenti confronto "legacy" (in chiaro) in modo timing-safe
    let valid = false;
    if (looksLikeBcryptHash(user.password)) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      try {
        const a = Buffer.from(password, "utf8");
        const b = Buffer.from(String(user.password), "utf8");
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) valid = true;
      } catch { /* ignore */ }
      // fallback prudenziale
      if (!valid && String(user.password) === password) valid = true;
    }

    if (!valid) {
      return res.status(401).json({ message: "Credenziali non valide" });
    }

    // --- genera token: preferisci JWT se disponibile ---
    let token;
    try {
      if (process.env.JWT_SECRET) {
        const jwt = require("jsonwebtoken");
        token = jwt.sign(
          { sub: user._id?.toString?.(), role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
      } else {
        token = crypto.randomBytes(24).toString("hex"); // fallback token random
      }
    } catch {
      token = crypto.randomBytes(24).toString("hex");
    }

    // payload utente (senza password) — restaurantId sempre stringa
    const outUser = {
      _id: user._id?.toString?.() || user.id,
      username: user.username || "",
      email: user.email || "",
      role: user.role || "",
      restaurantId: (user.restaurantId == null ? "" : String(user.restaurantId)), // stringa, anche ""
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
