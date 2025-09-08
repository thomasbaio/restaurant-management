// swagger.js
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Click&Food API",
      version: "1.0.0",
      description: "API per ristoratori, piatti, ordini. Documentazione OpenAPI 3.",
    },
    servers: [
      { url: "http://localhost:3000", description: "Dev" },
      { url: "https://restaurant-management-wzhj.onrender.com", description: "Prod" }
    ],
    components: {
      schemas: {
        // aggiungi qui i tuoi schemi (Meal, Restaurant, User, Error, ecc.)
      }
    }
  },
  apis: ["./**/*.js"], // legge le JSDoc dalle tue route (es. meals.js)
};

const spec = swaggerJSDoc(options);

function setupSwagger(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
  app.get("/api-docs.json", (_req, res) => res.json(spec));
}

module.exports = { setupSwagger };
