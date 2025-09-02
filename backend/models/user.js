const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },

    role: { type: String, enum: ["cliente", "ristoratore"], required: true },

    // campi aggiuntivi per ristoratore
    telefono: { type: String, trim: true },
    partitaIVA: { type: String, trim: true },
    luogo: { type: String, trim: true },
    indirizzo: { type: String, trim: true },

    // se è ristoratore, id del suo ristorante
    restaurantId: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
