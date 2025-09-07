const mongoose = require("mongoose");

let isConnected = 0;           // 0 = no, 1 = sì
let connectingPromise = null;  // evita doppi tentativi concorrenti

// opzionale: meno rumore con query non mappate
mongoose.set("strictQuery", true);

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGO_URI;

  // se non c'è URI → non uscire: avvisa e continua senza DB
  if (!mongoUri) {
    console.warn(" Missing MONGO_URI. start without DB.");
    return null;
  }

  // già connessi
  if (isConnected) return mongoose.connection;

  // connessione già in corso
  if (connectingPromise) return connectingPromise;

  // avvia connessione NON bloccante
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
    console.log(" MongoDB connected");

    // Eventi utili
    mongoose.connection.on("reconnected", () => console.log(" MongoDB reconnected"));
    mongoose.connection.on("disconnected", () => {
      isConnected = 0;
      console.warn(" MongoDB disconnected");
    });
    mongoose.connection.on("error", (err) => {
      isConnected = 0;
      console.error(" Error MongoDB:", err.message);
    });

    // Spegnimento pulito
    const gracefulExit = async (signal) => {
      try {
        await mongoose.connection.close();
        console.log(`Closure MongoDB su ${signal}`);
      } finally {
        process.exit(0);
      }
    };
    process.on("SIGINT", () => gracefulExit("SIGINT"));
    process.on("SIGTERM", () => gracefulExit("SIGTERM"));

    return mongoose.connection;
  })
  .catch(err => {
    // non terminare il processo: lascia partire l'HTTP server
    console.error("Connected failed to MongoDB :", err.message);
    // resetta lo stato così eventuali retry futuri sono possibili
    connectingPromise = null;
    isConnected = 0;
    return null;
  });

  return connectingPromise;
}

// utility per sapere se il DB è pronto (senza cambiare import esistenti)
connectDB.mongoReady = () => isConnected === 1;

module.exports = connectDB;
