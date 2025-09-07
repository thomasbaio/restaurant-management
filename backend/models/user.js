// ./models/user.js (estratto)
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['cliente', 'ristoratore'], default: 'cliente' },

  // campi ristoratore...
  telefono:   { type: String },
  partitaIva: { type: String },
  indirizzo:  { type: String },
  luogo:      { type: String },
  restaurantId: { type: String },
  restaurant: {
    restaurantId: String,
    nome: String,
    telefono: String,
    partitaIva: String,
    indirizzo: String,
    luogo: String
  },

  // preferenza del cliente (tipologia piatto)
  // Se vuoi stringa libera:
  preferenza: { type: String, trim: true }
  // Oppure con vincoli:
  // preferenza: { type: String, enum: ['pizza','pasta','burger','sushi','dessert','vegan','gluten-free'], default: undefined }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
