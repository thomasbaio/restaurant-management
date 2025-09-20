// restaurant.js
const express = require("express");
const router = express.Router();
const Restaurant = require("./models/restaurant");

/* ------------------------ helpers ------------------------ */

// converte un doc DB in output "pubblico" coerente con lo schema Swagger
function toPublic(r = {}) {
  // indirizzo può essere stringa o oggetto { via, ... }
  const addr =
    r.address ??
    (typeof r.indirizzo === "string"
      ? r.indirizzo
      : r.indirizzo?.via ?? undefined);

  return {
    restaurantId: r.restaurantId,
    name: r.name ?? r.nome,
    phone: r.phone ?? r.telefono,
    piva: r.piva ?? r.partitaIva,
    address: addr,
    place: r.place ?? r.luogo,
    _id: r._id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// mappa body in un set aggiornabile che copre sia campi EN che ITA
function normalizeBody(b = {}) {
  const out = {};

  // ID esplicito (opzionale: altrimenti lo generiamo in POST)
  if ("restaurantId" in b && b.restaurantId) out.restaurantId = String(b.restaurantId);

  // name / nome
  if (b.name != null || b.nome != null) {
    out.name = b.name ?? b.nome;
    out.nome = b.nome ?? b.name;
  }
  // phone / telefono
  if (b.phone != null || b.telefono != null) {
    out.phone = b.phone ?? b.telefono;
    out.telefono = b.telefono ?? b.phone;
  }
  // piva / partitaIva
  if (b.piva != null || b.partitaIva != null) {
    out.piva = b.piva ?? b.partitaIva;
    out.partitaIva = b.partitaIva ?? b.piva;
  }
  // address / indirizzo (accetta stringa o oggetto)
  if (b.address != null || b.indirizzo != null) {
    out.address = typeof b.address === "object" ? b.address?.via : b.address;
    out.indirizzo =
      typeof b.indirizzo === "object" ? b.indirizzo : { via: b.indirizzo ?? b.address ?? "" };
  }
  // place / luogo
  if (b.place != null || b.luogo != null) {
    out.place = b.place ?? b.luogo;
    out.luogo = b.luogo ?? b.place;
  }

  return out;
}

/* ------------------------ ROUTES ------------------------ */

/**
 * @swagger
 * /restaurants:
 *   get:
 *     tags: [Restaurants, fetch]
 *     summary: Elenco ristoranti
 *     description: Filtra per nome/luogo. Supporta sia campi italiani che inglesi nel DB.
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Testo libero su nome/luogo
 *       - in: query
 *         name: nome
 *         schema: { type: string }
 *       - in: query
 *         name: luogo
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista ristoranti
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: "#/components/schemas/Restaurant" }
 */
router.get("/", async (req, res) => {
  try {
    const { q, nome, luogo } = req.query;
    const and = [];

    if (q) {
      const rx = new RegExp(String(q), "i");
      and.push({
        $or: [{ name: rx }, { nome: rx }, { place: rx }, { luogo: rx }],
      });
    }
    if (nome) {
      const rx = new RegExp(String(nome), "i");
      and.push({ $or: [{ name: rx }, { nome: rx }] });
    }
    if (luogo) {
      const rx = new RegExp(String(luogo), "i");
      and.push({ $or: [{ place: rx }, { luogo: rx }] });
    }

    const filter = and.length ? { $and: and } : {};
    const data = await Restaurant.find(filter).lean();
    res.json(data.map(toPublic));
  } catch (err) {
    console.error("Error GET /restaurants:", err);
    res.status(500).json({ message: "Error during restaurant recovery" });
  }
});

/**
 * @swagger
 * /restaurants/{id}:
 *   get:
 *     tags: [Restaurants]
 *     summary: Dettaglio ristorante
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: restaurantId (es. r_o)
 *     responses:
 *       200:
 *         description: Ok
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Restaurant" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const restaurant = await Restaurant.findOne({ restaurantId: id }).lean();
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    res.json(toPublic(restaurant));
  } catch (err) {
    console.error("Error GET /restaurants/:id:", err);
    res.status(500).json({ message: "Error in the recovery of the restaurant" });
  }
});

/**
 * @swagger
 * /restaurants:
 *   post:
 *     tags: [Restaurants]
 *     summary: Crea ristorante
 *     description: Accetta campi in ITA o ENG (name/nome, phone/telefono, piva/partitaIva, address/indirizzo, place/luogo).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/Restaurant" }
 *     responses:
 *       201:
 *         description: Creato
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Restaurant" }
 *       400:
 *         $ref: "#/components/responses/ValidationError"
 */
router.post("/", async (req, res) => {
  try {
    const payload = normalizeBody(req.body || {});

    if (!payload.name && !payload.nome) {
      return res.status(400).json({ message: "name/nome è obbligatorio" });
    }

    if (!payload.restaurantId) {
      payload.restaurantId = `r_${Date.now()}`;
    }

    const created = await Restaurant.create(payload);
    res.status(201).json(toPublic(created.toObject()));
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ message: "Chiave duplicata", details: err.keyValue });
    }
    console.error("Error POST /restaurants:", err);
    res.status(500).json({ message: "Error in the creation of the restaurant" });
  }
});

/**
 * @swagger
 * /restaurants/{id}:
 *   put:
 *     tags: [Restaurants]
 *     summary: Modifica ristorante per restaurantId
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: restaurantId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/Restaurant" }
 *     responses:
 *       200:
 *         description: Aggiornato
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Restaurant" }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.put("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const set = normalizeBody(req.body || {});
    const updated = await Restaurant.findOneAndUpdate(
      { restaurantId: id },
      { $set: set },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Restaurant not found" });
    res.json(toPublic(updated));
  } catch (err) {
    console.error("Error PUT /restaurants/:id:", err);
    res.status(500).json({ message: "Error in the modification of the restaurant" });
  }
});

/**
 * @swagger
 * /restaurants/{id}:
 *   delete:
 *     tags: [Restaurants]
 *     summary: Elimina ristorante per restaurantId
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Eliminato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { ok: { type: boolean, example: true } }
 *       404: { $ref: "#/components/responses/NotFound" }
 */
router.delete("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const del = await Restaurant.deleteOne({ restaurantId: id });
    if (!del.deletedCount) return res.status(404).json({ message: "Restaurant not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error DELETE /restaurants/:id:", err);
    res.status(500).json({ message: "Error deleting restaurant" });
  }
});

module.exports = router;

