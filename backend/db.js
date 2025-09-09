require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const connectDB = require("./connectDB"); // <— il file che hai fornito
const mealsRouter = require("./meals");   // <— le tue route su file JSON o Mongo
const { setupSwagger } = require("./swagger"); // <— definito sotto al punto 2

const app = express();

// fidati del proxy (Render/Heroku)
app.set("trust proxy", 1);

// middlewares base
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// static (se servono file pubblici, opzionale)
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/meals", mealsRouter);

// Health check (utile per Render)
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    dbConnected: connectDB.mongoReady(),
    time: new Date().toISOString(),
  });
});

// Swagger UI + JSON spec
setupSwagger(app);

// avvio server + connessione DB (non blocca se MONGO_URI manca)
const PORT = process.env.PORT || 3000;
(async () => {
  await connectDB(process.env.MONGO_URI); // parte anche se non c’è MONGO_URI
  app.listen(PORT, () => {
    console.log(`HTTP server on http://localhost:${PORT}`);
    console.log(`Swagger UI → http://localhost:${PORT}/api-docs`);
    console.log(`OpenAPI JSON → http://localhost:${PORT}/api-docs.json`);
  });
})();
