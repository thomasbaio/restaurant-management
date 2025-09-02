const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Rotte API
const mealsRoutes = require('./meals');
const orderRoutes = require('./orders');
const userRoutes = require('./users');
const restaurantRoutes = require('./restaurant');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);         // utile su Render dietro proxy
app.use(cors());
app.use(express.json());

// 🔗 Connessione MongoDB (prima di usare le rotte Mongoose)
if (!process.env.MONGO_URI) {
  console.warn('⚠️  MONGO_URI non impostata: le rotte Mongoose potrebbero fallire.');
} else {
  mongoose.connect(process.env.MONGO_URI, {})
    .then(() => console.log('✅ Mongo connesso'))
    .catch(err => {
      console.error('❌ Errore connessione Mongo:', err.message);
      // non usciamo: il frontend rimane servibile
    });
}

// 🌐 Frontend statico (cartella /frontend a fianco di /backend)
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
console.log('📁 FRONTEND_DIR:', FRONTEND_DIR);
app.use(express.static(FRONTEND_DIR));

// 🔌 Rotte API (prima del catch-all)
app.use('/users', userRoutes);
app.use('/orders', orderRoutes);
app.use('/restaurant', restaurantRoutes);
app.use('/meals', mealsRoutes);

// 🩺 Health check semplice
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mongo: mongoose.connection?.readyState === 1 ? 'connected' : 'not_connected',
    time: new Date().toISOString(),
  });
});

// 🏠 Homepage
app.get('/', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// 🎯 Catch-all per pagine non-API (SPA o rotte senza .html)
app.get(/^(?!\/(meals|orders|users|restaurant|health)(\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server attivo su http://localhost:${PORT}`);
});
