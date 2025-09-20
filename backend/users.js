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
 *   description: Gestione utenti (lista, dettaglio, update, delete, cambio password).
 */

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
    const n = Number(param);
    const filter = isObjectId(param) ? { _id: param } : Number.isFinite(n) ? { legacyId: n } : null;
    if (!filter) return res.status(400).json({ message: "id non valido" });

    const u = await User.findOne(filter).select("-password").lean();
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json(u);
  } catch (err) {
    console.error("GET /users/:id error:", err);
    res.status(500).json({ message: "Error loading user" });
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
    delete updates.password; // per cambio password usa l'endpoint dedicato

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

