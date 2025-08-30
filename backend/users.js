const express = require('express');
const fs = require('fs');
const router = express.Router();

const USERS_FILE = './users.json';
const MEALS_FILE = './meals1.json';
const RESTAURANTS_FILE = './restaurants.json';

// 🔄 Leggi utenti
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

// 💾 Scrivi utenti
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// 🔄 Leggi ristoranti meals
function readMeals() {
  if (!fs.existsSync(MEALS_FILE)) return [];
  return JSON.parse(fs.readFileSync(MEALS_FILE));
}

// 💾 Scrivi ristoranti meals
function writeMeals(meals) {
  fs.writeFileSync(MEALS_FILE, JSON.stringify(meals, null, 2));
}

// 🔄 Leggi restaurants.json
function readRestaurants() {
  if (!fs.existsSync(RESTAURANTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(RESTAURANTS_FILE));
}

// 💾 Scrivi restaurants.json
function writeRestaurants(data) {
  fs.writeFileSync(RESTAURANTS_FILE, JSON.stringify(data, null, 2));
}

// ✅ REGISTRAZIONE
router.post('/register', (req, res) => {
  const {
    username, email, password, role,
    phone, location, vat, address,
    nome, cognome, pagamento, preferenza
  } = req.body;

  if (!username || !email || !password || !role) {
    return res.status(400).send("Tutti i campi obbligatori non sono stati forniti.");
  }

  const users = readUsers();

  if (users.find(u => u.username === username || u.email === email)) {
    return res.status(409).send("Username o email già registrati.");
  }

  const newUser = {
    id: users.length ? users[users.length - 1].id + 1 : 1,
    username,
    email,
    password,
    role,
    phone: phone || "",
    location: location || "",
    vat: vat || "",
    address: address || "",
    nome: nome || "",
    cognome: cognome || "",
    pagamento: pagamento || "",
    preferenza: preferenza || ""
  };

  // ➕ Se è ristoratore, crea anche ristorante in meals1.json e restaurants.json
  if (role === "ristoratore") {
    const meals = readMeals();
    const restaurantId = "r_" + username.toLowerCase().replace(/\s+/g, "");

    if (!meals.find(r => r.restaurantId === restaurantId)) {
      meals.push({
        restaurantId,
        nome: username + " Ristorante",
        email,
        phone,
        location,
        vat,
        address,
        menu: []
      });
      writeMeals(meals);
    }

    const restaurants = readRestaurants();
    const newRestaurant = {
      restaurantId,
      nome: username + " Ristorante",
      partitaIVA: vat || "",
      telefono: phone || "",
      luogo: location || "",
      indirizzo: address || ""
    };
    restaurants.push(newRestaurant);
    writeRestaurants(restaurants);

    newUser.restaurantId = restaurantId;
  }

  users.push(newUser);
  writeUsers(users);

  res.status(201).json({ message: "Registrazione completata", user: newUser });
});

// ✅ LOGIN (con restaurantId se ristoratore)
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) return res.status(401).send("Credenziali non valide");

  let restaurantId = null;

  if (user.role === "ristoratore") {
    const meals = readMeals();
    const ristoratore = meals.find(r => r.email === user.email || r.nome === user.username + " Ristorante");

    if (ristoratore) {
      restaurantId = ristoratore.restaurantId;
    }
  }

  const loggedUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    ...(restaurantId && { restaurantId })
  };

  res.json(loggedUser);
});

// ✅ MODIFICA
router.put('/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const users = readUsers();
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) return res.status(404).send("Utente non trovato");

  const updated = {
    ...users[index],
    ...req.body,
    id: userId
  };

  users[index] = updated;
  writeUsers(users);
  res.json(updated);
});

// ✅ CANCELLAZIONE
router.delete('/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const users = readUsers();
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) return res.status(404).send("Utente non trovato");

  users.splice(index, 1);
  writeUsers(users);
  res.sendStatus(204);
});

// ✅ Endpoint per ottenere tutti i ristoratori da users.json
router.get('/restaurants', (req, res) => {
  const users = readUsers();
  const ristoratori = users
    .filter(u => u.role === "ristoratore")
    .map(u => ({
      nome: u.username + " Ristorante",
      location: u.location,
      telefono: u.phone,
      partitaIVA: u.vat
    }));

  res.json(ristoratori);
});
module.exports = router;
