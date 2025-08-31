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

// Middleware
app.use(cors());
app.use(express.json()); // sostituisce body-parser

// Servire frontend statico (index.html, css, js)
app.use(express.static(path.join(__dirname)));

// Rotte API
app.use('/users', userRoutes);
app.use('/orders', orderRoutes);
app.use('/restaurant', restaurantRoutes);
app.use('/meals', mealsRoutes);

// Default route → index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Avvio server (Render userà process.env.PORT)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server attivo su http://localhost:${PORT}`);
});
