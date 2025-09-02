const express = require('express');
const cors = require('cors');
const path = require('path');

// Rotte API
const mealsRoutes = require('./meals');
const orderRoutes = require('./orders');
const userRoutes = require('./users');
const restaurantRoutes = require('./restaurant');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === Percorso assoluto alla cartella frontend ===
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
console.log('📁 FRONTEND_DIR:', FRONTEND_DIR);

// === Servire file statici (css, js, immagini, ecc.) ===
app.use(express.static(FRONTEND_DIR));

// === Rotte API (montate PRIMA del catch-all) ===
app.use('/users', userRoutes);
app.use('/orders', orderRoutes);
app.use('/restaurant', restaurantRoutes);
app.use('/meals', mealsRoutes);

// === Homepage ===
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// === Catch-all per pagine non-API (es. /login, /register, /ricerca_ristoranti.html, ecc.) ===
// Se usi multipagine fisiche, Express servirà direttamente i file (es. /login.html).
// Se usi rotte "pulite" senza .html, questo rimanda alla index (stile SPA).
app.get(/^(?!\/(meals|orders|users|restaurant)(\/|$)).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server attivo su http://localhost:${PORT}`);
});
