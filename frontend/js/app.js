const API_URL = 'http://localhost:3000/meals';

async function getMeals() {
  const res = await fetch(API_URL);
  return res.json();
}

// Esegui il caricamento automatico (solo se serve)
window.onload = async function () {
  const meals = await getMeals();
  console.log("Piatti:", meals);
};