const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
require('dotenv').config();

// Rotte API
const mealsRoutes = require('./meals');
const orderRoutes = require('./orders');
const userRoutes = require('./users');
const restaurantRoutes = require('./restaurant');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// 🔗 MongoDB
if (!process.env.MONGO_URI) {
  console.warn('⚠️  MONGO_URI non impostata: le rotte Mongoose potrebbero fallire.');
} else {
  mongoose.connect(process.env.MONGO_URI, {})
    .then(() => console.log('✅ Mongo connesso'))
    .catch(err => console.error('❌ Errore connessione Mongo:', err.message));
}

// 🌐 Frontend statico
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
console.log('📁 FRONTEND_DIR:', FRONTEND_DIR);
app.use(express.static(FRONTEND_DIR));

// 🔌 Rotte API
app.use('/users', userRoutes);
app.use('/orders', orderRoutes);
app.use('/restaurant', restaurantRoutes);
app.use('/meals', mealsRoutes);

// 🩺 Health check
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mongo: mongoose.connection?.readyState === 1 ? 'connected' : 'not_connected',
    time: new Date().toISOString(),
  });
});

/* ============================
   Swagger / OpenAPI 3.0
============================ */
const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`;

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: { title: 'Restaurant Management API', version: '1.0.0' },
    servers: [{ url: PUBLIC_BASE }, { url: `http://localhost:${PORT}` }],
    components: {
      schemas: {
        Meal: {
          type: 'object',
          properties: {
            idmeals: { type: 'integer', example: 101 },
            restaurantId: { type: 'string', example: 'r_o' },
            nome: { type: 'string', example: 'Margherita' },
            prezzo: { type: 'number', format: 'float', example: 7.5 },
            tipologia: { type: 'string', example: 'Pizza' },
            immagine: { type: 'string', example: 'https://...' },
            ingredients: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    },
    // Documentazione minima delle rotte principali
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: { '200': { description: 'OK' } }
        }
      },
      '/meals': {
        get: {
          summary: 'Lista dei piatti (con fallback da file se DB vuoto)',
          parameters: [
            { in: 'query', name: 'restaurantId', schema: { type: 'string' } },
            { in: 'query', name: 'tipologia', schema: { type: 'string' } },
            { in: 'query', name: 'search', schema: { type: 'string' } }
          ],
          responses: {
            '200': {
              description: 'Array di Meal',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Meal' } } } }
            }
          }
        },
        post: {
          summary: 'Crea un nuovo piatto (richiede DB attivo)',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Meal' } } }
          },
          responses: { '201': { description: 'Creato' }, '400': { description: 'Bad request' }, '503': { description: 'DB non disponibile' } }
        }
      },
      '/meals/{id}': {
        get: {
          summary: 'Dettaglio piatto per idmeals (DB) o idMeal (file)',
          parameters: [{ in: 'path', name: 'id', required: true, schema: { oneOf: [{ type: 'integer' }, { type: 'string' }] } }],
          responses: { '200': { description: 'OK' }, '404': { description: 'Non trovato' } }
        },
        put: {
          summary: 'Modifica piatto per idmeals (DB)',
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
          responses: { '200': { description: 'Aggiornato' }, '404': { description: 'Non trovato' }, '503': { description: 'DB non disponibile' } }
        },
        delete: {
          summary: 'Elimina piatto per idmeals (DB)',
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
          responses: { '204': { description: 'Eliminato' }, '404': { description: 'Non trovato' }, '503': { description: 'DB non disponibile' } }
        }
      },
      '/meals/{restaurantId}/{idmeals}': {
        delete: {
          summary: 'Elimina piatto passando restaurantId + idmeals (DB)',
          parameters: [
            { in: 'path', name: 'restaurantId', required: true, schema: { type: 'string' } },
            { in: 'path', name: 'idmeals', required: true, schema: { type: 'integer' } }
          ],
          responses: { '200': { description: 'Eliminato' }, '404': { description: 'Non trovato' }, '503': { description: 'DB non disponibile' } }
        }
      }
    }
  },
  // In futuro puoi aggiungere JSDoc nelle rotte e farle scansionare qui:
  apis: [path.join(__dirname, '*.js')],
});

// UI /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

// 🏠 Homepage
app.get('/', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// 🎯 Catch-all non-API
app.get(/^(?!\/(meals|orders|users|restaurant|health|api-docs)(\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server attivo su http://localhost:${PORT}`);
  console.log(`📚 Swagger UI: ${PUBLIC_BASE}/api-docs`);
});
