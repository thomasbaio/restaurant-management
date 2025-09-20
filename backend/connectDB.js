// connectDB.js
const mongoose = require("mongoose");

mongoose.set("strictQuery", true);

const STATE = ["disconnected", "connected", "connecting", "disconnecting"];

function mongoReady() {
  return mongoose?.connection?.readyState === 1;
}

function stateLabel() {
  return STATE[mongoose?.connection?.readyState ?? 0];
}

function redact(uri = "") {
  return uri.replace(/\/\/([^:@]+):([^@]+)@/, "//$1:***@");
}

/**
 * Connette a MongoDB se presente la MONGO_URI.
 * - Idempotente: se già connesso/connecting, non duplica le connessioni.
 * - Non lancia eccezioni: logga e restituisce null in caso di errore.
 * - Usa autoIndex solo in dev.
 */
async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGO_URI;
  if (!mongoUri) {
    console.warn("⚠️  MONGO_URI non impostato: avvio senza DB (fallback su file).");
    return null;
  }

  // già connesso
  if (mongoose.connection.readyState === 1) {
    console.log("✅ MongoDB già connesso.", mongoose.connection.name ? `DB: ${mongoose.connection.name}` : "");
    return mongoose.connection;
  }

  // in fase di connessione: attendi l'esito
  if (mongoose.connection.readyState === 2) {
    console.log("⏳ Connessione MongoDB in corso…");
    await new Promise((resolve, reject) => {
      const onOk = () => { cleanup(); resolve(); };
      const onErr = (err) => { cleanup(); reject(err); };
      const cleanup = () => {
        mongoose.connection.off("connected", onOk);
        mongoose.connection.off("error", onErr);
      };
      mongoose.connection.once("connected", onOk);
      mongoose.connection.once("error", onErr);
      // timeout di sicurezza
      setTimeout(() => { cleanup(); resolve(); }, 5000);
    }).catch(() => null);
    return mongoose.connection.readyState === 1 ? mongoose.connection : null;
  }

  // connetti
  try {
    const opts = {
      serverSelectionTimeoutMS: Number(process.env.MONGO_TIMEOUT_MS || 5000),
      maxPoolSize: Number(process.env.MONGO_POOL || 10),
      autoIndex: process.env.NODE_ENV !== "production",
    };

    // log essenziale
    console.log("🔌 Connessione a MongoDB:", redact(mongoUri));
    await mongoose.connect(mongoUri, opts);

    // event logging minimale
    mongoose.connection.on("error", (e) => console.error("🛑 Mongo error:", e.message));
    mongoose.connection.on("disconnected", () => console.warn("⚠️  Mongo disconnected"));
    mongoose.connection.on("reconnected", () => console.log("🔁 Mongo reconnected"));

    console.log(`✅ MongoDB connesso (state=${stateLabel()}) DB: ${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (err) {
    console.error("❌ Errore connessione MongoDB:", err.message);
    console.warn("➡️  Proseguo senza DB (fallback su file).");
    return null;
  }
}

/** Chiude la connessione in modo sicuro (per test/shutdown) */
async function closeDB() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log("🧹 Connessione MongoDB chiusa.");
    }
  } catch (e) {
    console.error("Errore chiusura MongoDB:", e?.message || e);
  }
}

module.exports = connectDB;
module.exports.mongoReady = mongoReady;
module.exports.closeDB = closeDB;
module.exports.stateLabel = stateLabel;
