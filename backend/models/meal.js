const mongoose = require("mongoose");

const MealSchema = new mongoose.Schema({
  idmeals: { type: Number, index: true, unique: true }, // ID numerico compat col frontend
  nome: { type: String, required: true },
  prezzo: { type: Number, required: true, min: 0 },
  tipologia: { type: String },             // es. "primo", "secondo", "pizza"
  ingredienti: { type: [String], default: [] },
  foto: { type: String },                  // URL o base64
  restaurantId: { type: String, required: true }, // es. "r_o"
  origine: { type: String, enum: ["comune", "personalizzato"], default: "personalizzato" },
  isCommon: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Meal", MealSchema);