const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    mealId: { type: String, required: true },  // id piatto (o _id se da Mongo)
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },   // prezzo unitario al momento dell'ordine
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },        // cliente che ordina
    restaurantId: { type: String, required: true },  // es: "r_o"
    items: { type: [OrderItemSchema], required: true },
    total: { type: Number, required: true },

    // stato ordine: ordinato → preparazione → consegna → consegnato
    status: {
      type: String,
      enum: ["ordinato", "preparazione", "consegna", "consegnato", "annullato"],
      default: "ordinato",
      index: true,
    },

    // consegna o ritiro
    fulfillment: {
      type: String,
      enum: ["ritiro", "consegna"],
      default: "ritiro",
    },

    // indirizzo consegna (se fulfillment === "consegna")
    deliveryAddress: {
      via: String,
      citta: String,
      cap: String,
      note: String,
    },

    // pagamento (semplificato)
    payment: {
      method: { type: String, enum: ["carta", "contanti", "online"], default: "carta" },
      paid: { type: Boolean, default: false },
      transactionId: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);
