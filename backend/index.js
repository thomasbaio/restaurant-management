const express = require('express');
const bodyParser = require('body-parser');
const mealsRoutes = require('./meals');
const orderRoutes = require('./orders');
const userRoutes = require('./users'); 
const restaurantRoutes = require("./restaurant");

const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.use('/users', userRoutes);
app.use('/orders', orderRoutes);
app.use("/restaurant", restaurantRoutes);
app.use('/meals', mealsRoutes);

app.listen(PORT, () => {
  console.log(`Server attivo su http://localhost:${PORT}`);
});
