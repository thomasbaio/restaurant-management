const mongoose = require("mongoose");

const MealSchema = new mongoose.Schema(
  {
    // Opzionale in inserimento (lo assegniamo lato backend); univoco quando presente
    idmeals: { type: Number, index: true, default: undefined },

    nome: { type: String, required: true, trim: true },
    prezzo: { type: Number, required: true, min: 0 },

    tipologia: { type: String, trim: true }, // es. "primo", "secondo", "pizza"
    ingredienti: { type: [String], default: [] }, // canonico nel DB
    foto: { type: String, trim: true }, // URL o base64

    restaurantId: { type: String, required: true, index: true, trim: true }, // es. "r_o"

    origine: {
      type: String,
      enum: ["comune", "personalizzato"],
      default: "personalizzato",
      index: true,
    },

    isCommon: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ---------- Indici ----------
// idmeals univoco SOLO quando presente (sparse evita conflitti con null/undefined)
MealSchema.index({ idmeals: 1 }, { unique: true, sparse: true });

// Query comuni per ristorante e ordinamento per idmeals
MealSchema.index({ restaurantId: 1, idmeals: 1 });

// ---------- Virtuals di comodo per l'output ----------
// Alias array
MealSchema.virtual("ingredients").get(function () {
  return Array.isArray(this.ingredienti) ? this.ingredienti : [];
});

// Alias stringa "a, b, c"
MealSchema.virtual("ingredient").get(function () {
  return Array.isArray(this.ingredienti) ? this.ingredienti.join(", ") : "";
});

module.exports = mongoose.model("Meal", MealSchema);
