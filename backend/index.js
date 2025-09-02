const express = require('express');
const cors = require('cors');
const path = require('path');

// Rotte
const mealsRoutes = require('./meals');
const orderRoutes = require('./orders');
const userRoutes = require('./users');
const restaurantRoutes = require('./restaurant');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // sostituisce body-parser

// === Servire frontend statico dalla root del progetto ===
const FRONTEND_DIR = path.join(__dirname, '..'); // vai fuori da backend/
app.use(express.static(FRONTEND_DIR));

// === Rotte API ===
app.use('/users', userRoutes);
app.use('/orders', orderRoutes);
app.use('/restaurant', restaurantRoutes);
app.use('/meals', mealsRoutes);

// === Default route → index.html della root ===
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Avvio server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server attivo su http://localhost:${PORT}`);
});
