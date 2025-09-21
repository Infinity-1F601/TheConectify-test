'use strict';

const http = require('http');
const app = require('./src/app.js');
const { WebSocketFriend } = require('./src/wss/friend.wss.js');

const server = http.createServer(app);

// Ініціалізуємо WebSocket-сервери
const wssFriend = WebSocketFriend();

server.on('upgrade', (req, socket, head) => {
    console.log('Upgrade request URL:', req.url);
   
     if (req.url.startsWith('/Friend')) {
      wssFriend.handleUpgrade(req, socket, head, (ws) => {
        wssFriend.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

const port = 8000

server.listen(port , () => {
  console.log(`Server started on port ${port}`);
});

