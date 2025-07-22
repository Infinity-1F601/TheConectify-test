'use strict';

const express = require('express');
const cors = require('cors');


const app = express();

// CORS конфіг
const corsOptions = {
  origin: [
    'https://the-conectify-client.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};


// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // для preflight
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔄 Логування кожного запиту (для дебагу, можеш вимкнути потім)
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

// Роути

// Обробка 404
app.use((req, res) => {
  res.status(404).json({ message: "Маршрут не знайдено (404)" });
});

// Обробка помилок
app.use((err, req, res, next) => {
  console.error(`🔥 Помилка в ${req.method} ${req.url}:\n`, err.stack);
  res.status(500).json({ message: 'Внутрішня помилка сервера', error: err.message });
});

module.exports = app
