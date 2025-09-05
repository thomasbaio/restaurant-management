// models/order.js
const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    mealId: { type: String, required: true }, // id piatto (string o _id)
    name:   { type: String },                 // snapshot nome (opzionale ma consigliato)
    qty:    { type: Number, required: true, min: 1, default: 1 },
    price:  { type: Number },                 // prezzo unitario snapshot (opzionale)
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    // ---- Compatibilità con vecchie API / frontend ----
    id: { type: Number, index: true },           // ID incrementale (settato dalla rotta)
    username: { type: String, index: true },     // username del cliente (compat)

    // ---- Campi "nuovi" che già usavi ----
    userId: { type: String, index: true },       // id utente (se lo usi)
    restaurantId: { type: String, index: true }, // es: "r_o"

    // Snapshot degli articoli acquistati
    items: { type: [OrderItemSchema], default: [], required: true },

    // Lista semplice di id (compat per vecchio frontend)
    meals: { type: [String], default: [] },

    // Totale ordine (ricalcolato in pre-save)
    total: { type: Number, default: 0, min: 0 },

    // ---- Stato ordine (➕ 'ritirato') ----
    status: {
      type: String,
      enum: ["ordinato", "preparazione", "consegna", "consegnato", "ritirato", "annullato"],
      default: "ordinato",
      index: true,
    },

    // ---- Fulfillment/Delivery (con mapping) ----
    // ritiro  <-> asporto
    // consegna <-> domicilio
    fulfillment: { type: String, enum: ["ritiro", "consegna"], default: "ritiro" },
    delivery:    { type: String, enum: ["asporto", "domicilio"], default: "asporto" },

    // Indirizzo: tieni entrambi per compatibilità
    address: { type: String }, // compat frontend
    deliveryAddress: {
      via: String,
      citta: String,
      cap: String,
      note: String,
    },

    // pagamento
    payment: {
      method: { type: String, enum: ["carta", "contanti", "online"], default: "carta" },
      paid: { type: Boolean, default: false },
      transactionId: String,
    },

    // ---- Tracciamento consegna/ritiro (➕) ----
    deliveredAt: Date,                 // quando è stato segnato "consegnato"
    ritiratoAt: Date,                  // quando è stato segnato "ritirato"
    ritiroConfermato: { type: Boolean, default: false },       // conferma ritiro lato backend
    clienteConfermaRitiro: { type: Boolean, default: false },  // flag inviato dal client
  },
  { timestamps: true }
);

// ---- Normalizzazioni automatiche ----

// Mappa fulfillment -> delivery e viceversa
function syncFulfillmentDelivery(doc) {
  // Se ho fulfillment ma non delivery, genero delivery
  if (doc.isModified("fulfillment") || doc.delivery == null) {
    if (doc.fulfillment === "ritiro") doc.delivery = "asporto";
    else if (doc.fulfillment === "consegna") doc.delivery = "domicilio";
  }
  // Se ho delivery ma non fulfillment, genero fulfillment
  if (doc.isModified("delivery") || doc.fulfillment == null) {
    if (doc.delivery === "asporto") doc.fulfillment = "ritiro";
    else if (doc.delivery === "domicilio") doc.fulfillment = "consegna";
  }
}

// Calcola totale e lista meals dagli items
function recomputeTotals(doc) {
  let tot = 0;
  const ids = [];
  for (const it of doc.items || []) {
    const qty = Number(it.qty || 1);
    const price = Number(it.price || 0);
    if (it.mealId) ids.push(String(it.mealId));
    tot += qty * (isNaN(price) ? 0 : price);
  }
  doc.total = Number(tot.toFixed(2));
  if (!Array.isArray(doc.meals) || doc.meals.length !== ids.length) {
    doc.meals = ids;
  }
}

OrderSchema.pre("validate", function(next) {
  syncFulfillmentDelivery(this);
  next();
});

OrderSchema.pre("save", function(next) {
  syncFulfillmentDelivery(this);
  recomputeTotals(this);

  // Se address vuoto ma ho deliveryAddress, creo una stringa comoda (compat)
  if (!this.address && this.deliveryAddress && (this.delivery === "domicilio")) {
    const a = this.deliveryAddress;
    const parts = [a?.via, a?.citta, a?.cap].filter(Boolean);
    if (parts.length) this.address = parts.join(", ");
  }

  // Se lo stato è cambiato, aggiorno i timestamp coerenti
  if (this.isModified("status")) {
    const s = String(this.status || "");
    if (s === "consegnato" && !this.deliveredAt) this.deliveredAt = new Date();
    if (s === "ritirato"   && !this.ritiratoAt)  this.ritiratoAt  = new Date();
    if (s === "ritirato") this.ritiroConfermato = true;
  }

  next();
});

// Indici utili
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ id: -1 }); // per nextOrderId e fetch per id

module.exports = mongoose.model("Order", OrderSchema);
