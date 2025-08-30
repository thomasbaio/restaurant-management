const mongoose = require("mongoose");

let isConnected = 0; // 0 = no, 1 = yes

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("❌ MONGO_URI mancante. Definiscila in .env");
    process.exit(1);
  }

  if (isConnected) return mongoose.connection;

  try {
    // Opzioni conservative e tempi di selezione server chiari
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10,
      autoIndex: true,
    });

    isConnected = 1;
    console.log("✅ MongoDB connesso");

    // Eventi utili per debug
    mongoose.connection.on("reconnected", () => console.log("🔄 MongoDB riconnesso"));
    mongoose.connection.on("disconnected", () => console.warn("⚠️ MongoDB disconnesso"));
    mongoose.connection.on("error", (err) => console.error("💥 Errore MongoDB:", err));

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
  } catch (err) {
    console.error("❌ Errore connessione MongoDB:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
