// db.js — versione non-bloccante per Render/produzione
const mongoose = require("mongoose");

let isConnected = 0;           // 0 = no, 1 = sì
let connectingPromise = null;  // evita doppi tentativi concorrenti

// opzionale: meno rumore con query non mappate
mongoose.set("strictQuery", true);

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGO_URI;

  // Se non c'è URI → non uscire: avvisa e continua senza DB
  if (!mongoUri) {
    console.warn("⚠️  MONGO_URI mancante. Avvio senza DB (le rotte che richiedono il DB potrebbero fallire).");
    return null;
  }

  // già connessi
  if (isConnected) return mongoose.connection;

  // connessione già in corso
  if (connectingPromise) return connectingPromise;

  // Avvia connessione NON bloccante (non fare process.exit in caso di errore)
  connectingPromise = mongoose.connect(mongoUri, {
    // timeout breve per evitare deploy timeout su Render
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
    // in prod disabilita autoIndex per performance
    autoIndex: process.env.NODE_ENV !== "production",
    // dbName opzionale da env
    dbName: process.env.MONGO_DB_NAME || undefined,
  })
  .then(() => {
    isConnected = 1;
    console.log("✅ MongoDB connesso");

    // Eventi utili
    mongoose.connection.on("reconnected", () => console.log("🔄 MongoDB riconnesso"));
    mongoose.connection.on("disconnected", () => {
      isConnected = 0;
      console.warn("⚠️  MongoDB disconnesso");
    });
    mongoose.connection.on("error", (err) => {
      isConnected = 0;
      console.error("💥 Errore MongoDB:", err.message);
    });

    // Spegnimento pulito
    const gracefulExit = async (signal) => {
      try {
        await mongoose.connection.close();
        console.log(`👋 Chiusura MongoDB su ${signal}`);
      } finally {
        process.exit(0);
      }
    };
    process.on("SIGINT", () => gracefulExit("SIGINT"));
    process.on("SIGTERM", () => gracefulExit("SIGTERM"));

    return mongoose.connection;
  })
  .catch(err => {
    // NON terminare il processo: lascia partire l'HTTP server
    console.error("❌ Connessione MongoDB fallita (continua senza DB):", err.message);
    // resetta lo stato così eventuali retry futuri sono possibili
    connectingPromise = null;
    isConnected = 0;
    return null;
  });

  return connectingPromise;
}

// Utility per sapere se il DB è pronto (senza cambiare import esistenti)
connectDB.mongoReady = () => isConnected === 1;

module.exports = connectDB;
