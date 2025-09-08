const mongoose = require("mongoose");

let connectingPromise = null;   // evita doppi tentativi concorrenti
let listenersBound = false;     // evita di aggiungere più volte i listener

// opzionale: meno rumore con query non mappate (lascia pure true)
mongoose.set("strictQuery", true);

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGO_URI;

  // se non c'è URI → non uscire: avvisa e continua senza DB
  if (!mongoUri) {
    console.warn("Missing MONGO_URI. Starting without DB.");
    return null;
  }

  // già connessi
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  // connessione già in corso
  if (connectingPromise) return connectingPromise;

  // bind listener una sola volta
  if (!listenersBound) {
    listenersBound = true;
    mongoose.connection.on("reconnected", () => console.log("MongoDB reconnected"));
    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected");
    });
    mongoose.connection.on("error", (err) => {
      console.error("MongoDB error:", err.message);
    });

    // Spegnimento pulito
    const gracefulExit = async (signal) => {
      try {
        await mongoose.connection.close();
        console.log(`MongoDB connection closed on ${signal}`);
      } finally {
        process.exit(0);
      }
    };
    process.on("SIGINT", () => gracefulExit("SIGINT"));
    process.on("SIGTERM", () => gracefulExit("SIGTERM"));
  }

  // avvia connessione NON bloccante
  connectingPromise = mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000, // breve per Render
    maxPoolSize: 10,
    autoIndex: process.env.NODE_ENV !== "production",
    dbName: process.env.MONGO_DB_NAME || undefined,
    family: 4, // preferisci IPv4 (opzionale ma utile su alcuni host)
  })
  .then(() => {
    console.log("MongoDB connected");
    return mongoose.connection;
  })
  .catch(err => {
    // non terminare il processo: lascia partire l'HTTP server
    console.error("Failed to connect to MongoDB:", err.message);
    // reset per permettere retry futuri
    connectingPromise = null;
    return null;
  });

  return connectingPromise;
}

// utility per sapere se il DB è pronto
connectDB.mongoReady = () => mongoose.connection.readyState === 1;

// (opzionale) utility per disconnettersi esplicitamente (test/shutdown)
connectDB.disconnect = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
  }
};

module.exports = connectDB;
