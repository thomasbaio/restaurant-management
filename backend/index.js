const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require("./db");

const mealsRoutes = require('./meals');
const orderRoutes = require('./orders');
const userRoutes = require('./users');
const restaurantRoutes = require('./restaurant');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // sostituisce body-parser

// Rotte API
app.use('/users', userRoutes);
app.use('/orders', orderRoutes);
app.use('/restaurant', restaurantRoutes);
app.use('/meals', mealsRoutes);

// Avvio server SOLO dopo connessione a MongoDB
connectDB(process.env.MONGO_URI).then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server attivo su http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error("❌ Errore avvio server:", err);
});
