// models/user.js
const mongoose = require("mongoose");

const RestaurantSubSchema = new mongoose.Schema({
  restaurantId: { type: String },
  nome:        { type: String, default: "" },
  telefono:    { type: String, default: "" },
  partitaIva:  { type: String, default: "" }, // <-- coerente con backend
  indirizzo:   { type: String, default: "" },
  luogo:       { type: String, default: "" }
}, { _id: false });

const UserSchema = new mongoose.Schema(
  {
    username:   { type: String, required: true, unique: true, trim: true },
    email:      { type: String, required: true, unique: true, trim: true },
    password:   { type: String, required: true },

    role:       { type: String, enum: ["cliente", "ristoratore"], required: true },

    // campi aggiuntivi per ristoratore
    telefono:   { type: String, trim: true },
    partitaIva: { type: String, trim: true },  // <-- minuscolo
    luogo:      { type: String, trim: true },
    indirizzo:  { type: String, trim: true },

    // se è ristoratore, id del suo ristorante
    restaurantId: { type: String, trim: true },

    // sotto-documento con i dati del ristorante
    restaurant: { type: RestaurantSubSchema }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
