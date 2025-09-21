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

// utils
function normalizeBody(b = {}) {
  return {
    username: b.username,
    email: b.email,
    password: b.password,
    role: b.role,
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
const isNumericId = (id) => /^\d+$/.test(String(id));

/* -------- LISTA -------- */
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

/* -------- /users/restaurants PRIMA delle :id -------- */
router.get("/restaurants", async (_req, res) => {
  try {
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

/* -------- DETTAGLIO -------- */
router.get("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const filter = isObjectId(param)
      ? { _id: param }
      : isNumericId(param)
      ? { legacyId: Number(param) }
      : null;
    if (!filter) return res.status(400).json({ message: "id non valido" });

    const u = await User.findOne(filter).select("-password").lean();
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json(u);
  } catch (err) {
    console.error("GET /users/:id error:", err);
    res.status(500).json({ message: "Error loading user" });
  }
});

/* -------- UPDATE -------- */
router.put("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const filter = isObjectId(param)
      ? { _id: param }
      : isNumericId(param)
      ? { legacyId: Number(param) }
      : null;
    if (!filter) return res.status(400).json({ message: "id non valido" });

    const updates = { ...normalizeBody(req.body) };
    delete updates._id;
    delete updates.legacyId;
    delete updates.username;
    delete updates.role;
    delete updates.password;

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

/* -------- CHANGE PASSWORD -------- */
router.put("/:id/password", async (req, res) => {
  try {
    const param = String(req.params.id);
    const filter = isObjectId(param)
      ? { _id: param }
      : isNumericId(param)
      ? { legacyId: Number(param) }
      : null;
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

/* -------- DELETE -------- */
router.delete("/:id", async (req, res) => {
  try {
    const param = String(req.params.id);
    const filter = isObjectId(param)
      ? { _id: param }
      : isNumericId(param)
      ? { legacyId: Number(param) }
      : null;
    if (!filter) return res.status(400).json({ message: "id non valido" });

    const deleted = await User.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ message: "Utente not found" });
    res.sendStatus(204);
  } catch (err) {
    console.error("User deletion error:", err);
    res.status(500).json({ message: "Error while deleting" });
  }
});

module.exports = router;



