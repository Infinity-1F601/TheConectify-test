const  fetch = require("node-fetch");

// кожні 15 хв сервер пінгає сам себе
setInterval(async () => {
  try {
    const res = await fetch("http://localhost:3000/ping"); 
    console.log("self-ping ok:", await res.json());
  } catch (e) {
    console.error("self-ping error:", e);
  }
}, 15 * 60 * 1000);
