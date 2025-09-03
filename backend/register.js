// users.js — versione MongoDB con bcrypt e campi ristoratore
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const User = require('./models/user'); // modello Mongoose User

// POST /users/register
router.post('/register', async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      role = 'cliente',
      telefono,
      partitaIva,
      indirizzo,
      luogo,
      restaurantName,
      restaurantId: restaurantIdFromBody
    } = req.body;

    // 1) Validazione minima
    if (!username || !email || !password) {
      return res.status(400).send('username, email e password sono obbligatori');
    }

    // 2) Unicità username/email
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      const field = existing.username === username ? 'username' : 'email';
      return res.status(400).send(`${field} già registrato`);
    }

    // 3) Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4) Se ristoratore, gestisci restaurantId e campi ristorante
    let restaurant = undefined;
    let restaurantId = null;
    if (role === 'ristoratore') {
      restaurantId = restaurantIdFromBody || `r_${Date.now()}`;
      restaurant = {
        restaurantId,
        nome: restaurantName || '',
        telefono: telefono || '',
        partitaIva: partitaIva || '',
        indirizzo: indirizzo || '',
        luogo: luogo || ''
      };
    }

    // 5) Crea utente
    const newUser = new User({
      username,
      email,
      password: passwordHash,
      role,
      telefono: role === 'ristoratore' ? telefono : undefined,
      partitaIva: role === 'ristoratore' ? partitaIva : undefined,
      indirizzo: role === 'ristoratore' ? indirizzo : undefined,
      luogo: role === 'ristoratore' ? luogo : undefined,
      restaurantId,
      restaurant
    });

    await newUser.save();

    // 6) Risposta (senza password)
    return res.status(201).json({
      message: 'Registrazione completata',
      user: {
        id: newUser._id.toString(),
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        restaurantId: newUser.restaurantId || null
      }
    });
  } catch (err) {
    console.error('Errore registrazione:', err);
    return res.status(500).send('Errore durante la registrazione');
  }
});

module.exports = router;
