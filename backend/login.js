router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).send("Credenziali non valide");
  }

  res.json({ username: user.username, role: user.role });
});