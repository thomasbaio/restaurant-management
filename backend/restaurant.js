const express = require("express");
const router = express.Router();
const Restaurant = require("./models/restaurant");

// get lista ristoranti
router.get("/", async (req, res) => {
  try {
    const { nome, luogo } = req.query;
    const q = {};
    if (nome)  q.nome  = { $regex: nome,  $options: "i" };
    if (luogo) q.luogo = { $regex: luogo, $options: "i" };
    const data = await Restaurant.find(q).lean();
    res.json(data);
  } catch (err) {
    console.error("Error get /restaurant:", err);
    res.status(500).send("Error during in restaurant recovery");
  }
});

// get ristorante per restaurantId (stringa o numero nel path)
router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id); // manteniamo tutto come stringa (es. "r_o")
    const restaurant = await Restaurant.findOne({ restaurantId: id }).lean();
    if (!restaurant) return res.status(404).send("Restaurant not found");
    res.json(restaurant);
  } catch (err) {
    console.error("Error GET /restaurant/:id:", err);
    res.status(500).send("Error in the recovery of the restaurant");
  }
});

// post nuovo ristorante
router.post("/", async (req, res) => {
  try {
    const payload = { ...req.body };

    // se non arriva un restaurantId, generane uno
    if (!payload.restaurantId) {
      payload.restaurantId = `r_${Date.now()}`;
    }

    const created = await Restaurant.create(payload);
    res.status(201).json(created);
  } catch (err) {
    // gestione duplicate key (es. restaurantId già esistente)
    if (err?.code === 11000) {
      return res.status(400).json({ error: "Chiave duplicated", details: err.keyValue });
    }
    console.error("Error POST /restaurant:", err);
    res.status(500).send("Error in the creation of the restaurant");
  }
});

// put modifica ristorante per restaurantId
router.put("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const updated = await Restaurant.findOneAndUpdate(
      { restaurantId: id },
      { $set: req.body },
      { new: true }
    );
    if (!updated) return res.status(404).send("Ristorante not found");
    res.json(updated);
  } catch (err) {
    console.error("Errore PUT /restaurant/:id:", err);
    res.status(500).send("Error in the modification of the restaurant");
  }
});

module.exports = router;

