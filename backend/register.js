const express = require('express');
const fs = require('fs');
const router = express.Router();
const USERS_FILE = './users.json';

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

// Registrazione
router.post('/register', (req, res) => {
  const { username, password, role } = req.body;
  const users = readUsers();

  if (users.find(u => u.username === username)) {
    return res.status(400).send("Utente già registrato");
  }

  const newUser = { username, password, role };
  users.push(newUser);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  res.status(201).send("Registrazione completata");
});

module.exports = router;