// users.js
const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const User = require("./models/user");
const Restaurant = require("./models/restaurant");

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Gestione utenti (lista, dettaglio, update, delete, cambio password).
 */

/* ================== UTILS ================== */

// normalizza i campi tra vecchi e nuovi nomi
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

/* ================== ROUTES ================== */

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
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
 * /users/restaurants:
 *   get:
 *     tags: [Users]
 *     summary: Lista ristoratori (compat)
 *     responses:
 *       200:
 *         description: Elenco ristoranti/ristoratori
 */
router.get("/restaurants", async (_req, res) => {
  try {
    // preferisci la collezione Ristoranti se presente
    const restaurants = await Restaurant.find().lean();
    if (restaurants?.length) {
      const out = restaurants.map((r) => ({
        nome: r.nome ?? r.name ?? "",
        location: r.luogo || r.location || "",
        telefono: r.telefono || r.phone || "",
        partitaIVA: r.partitaIva || r.vat || "",
        restaurantId: r.restaurantId ?? r.id ?? r._id ?? null,
      }));
      return res.json(out);
    }

    // fallback: utenti con role="ristoratore"
    const users = await User.find({ role: "ristoratore" }).lean();
    const out = users.map((u) => ({
      nome: `${u.username} Ristorante`,
      location: u.luogo || u.location || "",
      telefono: u.telefono || u.phone || "",
      partitaIVA: u.partitaIva || u.vat || "",
      restaurantId: u.restaurantId ?? u.legacyId ?? u._id ?? null,
    }));
    res.json(out);
  } catch (err) {
    console.error("Error GET /users/restaurants:", err);
    res.status(500).json({ message: "Error in restaurateur recovery" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Dettaglio utente (legacyId numerico o _id ObjectId)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { oneOf: [{ type: string, pattern: "^[a-fA-F0-9]{24}$" }, { type: string, pattern: "^\\d+$" }] }
 *     responses:
 *       200: { description: Ok }
 *       404: { description: Not Found }
 */
router.get("/:id([a-fA-F0-9]{24}|\\d+)", async (req, res) => {
  try {
    const param = String(req.params.id);
    const isObjectId = /^[a-f0-9]{24}$/i.test(param);
    const isNumeric = /^\d+$/.test(param);
    const filter = isObjectId ? { _id: param } : isNumeric ? { legacyId: Number(param) } : null;
    if (!filter) return res.status(400).json({ message: "id non valido" });

    const u = await User.findOne(filter).select("-password").lean();
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json(u);
  } catch (err) {
    console.error("GET /users/:id error:", err);
    res.status(500).json({ message: "Error loading user" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Aggiorna profilo/ristoratore (legacyId o _id)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { oneOf: [{ type: string, pattern: "^[a-fA-F0-9]{24}$" }, { type: string, pattern: "^\\d+$" }] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/User' }
 *     responses:
 *       200: { description: Utente aggiornato }
 *       404: { description: Not Found }
 */
router.put("/:id([a-fA-F0-9]{24}|\\d+)", async (req, res) => {
  try {
    const param = String(req.params.id);
    const isObjectId = /^[a-f0-9]{24}$/i.test(param);
    const filter = isObjectId ? { _id: param } : { legacyId: Number(param) };

    const body = normalizeBody(req.body);
    const updates = { ...body };

    // non permettere di cambiare campi chiave direttamente:
    delete updates._id;
    delete updates.legacyId;
    delete updates.username; // togli se vuoi permetterlo
    delete updates.role;     // togli se vuoi permetterlo
    delete updates.password; // cambia via endpoint dedicato

    const updated = await User.findOneAndUpdate(filter, { $set: updates }, { new: true })
      .select("-password")
      .lean();
    if (!updated) return res.status(404).json({ message: "Utente not found" });

    res.json(updated);
  } catch (err) {
    console.error("PUT /users/:id error:", err);
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
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { oneOf: [{ type: string, pattern: "^[a-fA-F0-9]{24}$" }, { type: string, pattern: "^\\d+$" }] }
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
 *       404: { description: Not Found }
 */
router.put("/:id([a-fA-F0-9]{24}|\\d+)/password", async (req, res) => {
  try {
    const param = String(req.params.id);
    const isObjectId = /^[a-f0-9]{24}$/i.test(param);
    const filter = isObjectId ? { _id: param } : { legacyId: Number(param) };

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
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { oneOf: [{ type: string, pattern: "^[a-fA-F0-9]{24}$" }, { type: string, pattern: "^\\d+$" }] }
 *     responses:
 *       204: { description: Cancellato }
 *       404: { description: Not Found }
 */
router.delete("/:id([a-fA-F0-9]{24}|\\d+)", async (req, res) => {
  try {
    const param = String(req.params.id);
    const isObjectId = /^[a-f0-9]{24}$/i.test(param);
    const filter = isObjectId ? { _id: param } : { legacyId: Number(param) };

    const deleted = await User.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ message: "Utente not found" });

    res.sendStatus(204);
  } catch (err) {
    console.error("User deletion error:", err);
    res.status(500).json({ message: "Error while deleting" });
  }
});

module.exports = router;


