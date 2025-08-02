const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

function WebSocketFriend() {
  const wss = new WebSocket.Server({ noServer: true });

  const queue = [];
  const sessions = new Map();
  const activeSessions = new Map();

  function countCommonCategories(arr1, arr2) {
    const set2 = new Set(arr2);
    return arr1.filter((cat) => set2.has(cat)).length;
  }

  function send(ws, obj) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function findBySessionId(sessionId) {
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) return null;

    const user1Active = sessionData.user1 && sessionData.user1.readyState === WebSocket.OPEN;
    const user2Active = sessionData.user2 && sessionData.user2.readyState === WebSocket.OPEN;

    if (!user1Active) sessionData.user1 = null;
    if (!user2Active) sessionData.user2 = null;

    if (!sessionData.user1 && !sessionData.user2) {
      // Встановлюємо таймер на видалення через 2 хвилини
      setTimeout(() => {
        const latest = activeSessions.get(sessionId);
        if (
          latest &&
          (!latest.user1 || latest.user1.readyState !== WebSocket.OPEN) &&
          (!latest.user2 || latest.user2.readyState !== WebSocket.OPEN)
        ) {
          activeSessions.delete(sessionId);
          console.log(`🗑️ Сесію ${sessionId} видалено через неактивність`);
        }
      }, 2 * 60 * 1000);
    }

    return sessionData;
  }

  function cleanupSession(ws) {
    const session = sessions.get(ws);
    if (!session) return;

    const sessionData = activeSessions.get(session.sessionId);
    if (sessionData) {
      if (sessionData.user1 === ws && sessionData.user2?.readyState === WebSocket.OPEN) {
        send(sessionData.user2, { type: 'partner-disconnected' });
        sessions.delete(sessionData.user2);
      } else if (sessionData.user2 === ws && sessionData.user1?.readyState === WebSocket.OPEN) {
        send(sessionData.user1, { type: 'partner-disconnected' });
        sessions.delete(sessionData.user1);
      }

      if (sessionData.user1 === ws) sessionData.user1 = null;
      if (sessionData.user2 === ws) sessionData.user2 = null;

      if (!sessionData.user1 && !sessionData.user2) {
        setTimeout(() => {
          const latest = activeSessions.get(session.sessionId);
          if (
            latest &&
            (!latest.user1 || latest.user1.readyState !== WebSocket.OPEN) &&
            (!latest.user2 || latest.user2.readyState !== WebSocket.OPEN)
          ) {
            activeSessions.delete(session.sessionId);
            console.log(`🗑️ Сесію ${session.sessionId} видалено через неактивність`);
          }
        }, 2 * 60 * 1000);
      }
    }

    sessions.delete(ws);
  }

  wss.on('connection', (ws) => {
    console.log('🔌 Підключено нового клієнта');

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        console.log('📨 Отримано повідомлення:', msg);

        if (msg.type === 'find') {
          if (sessions.has(ws)) {
            send(ws, { type: 'error', message: 'Ви вже в сесії' });
            return;
          }

          let bestMatch = null;
          let maxCommon = 0;

          for (const entry of queue) {
            const common = countCommonCategories(msg.categories, entry.categories);
            if (common > maxCommon) {
              maxCommon = common;
              bestMatch = entry;
            }
          }

          if (bestMatch) {
            queue.splice(queue.indexOf(bestMatch), 1);
            const sessionId = uuidv4();

            activeSessions.set(sessionId, {
              user1: bestMatch.ws,
              user2: ws,
              created: Date.now(),
            });

            sessions.set(ws, { partner: bestMatch.ws, sessionId });
            sessions.set(bestMatch.ws, { partner: ws, sessionId });

            send(ws, { type: 'match-found', sessionId, categories: bestMatch.categories });
            send(bestMatch.ws, { type: 'match-found', sessionId, categories: msg.categories });

            console.log(`✅ Створено сесію: ${sessionId}`);
          } else {
            queue.push({ ws, categories: msg.categories });
            send(ws, { type: 'searching', message: 'Пошук співрозмовника...' });
            console.log('🕓 Додано в чергу');
          }
        }

        else if (msg.type === 'cancel-find') {
          const index = queue.findIndex((entry) => entry.ws === ws);
          if (index !== -1) {
            queue.splice(index, 1);
            send(ws, { type: 'search-cancelled' });
            console.log('⛔ Скасовано пошук');
          }
        }

        else if (msg.type === 'join-session') {
          const sessionData = findBySessionId(msg.sessionId);

          if (!sessionData) {
            send(ws, {
              type: 'session-not-found',
              sessionId: msg.sessionId,
              message: 'Сесія не знайдена або неактивна',
            });
            return;
          }

          // Призначаємо ws у вільне місце
          if (!sessionData.user1 || sessionData.user1.readyState !== WebSocket.OPEN) {
            sessionData.user1 = ws;
          } else if (!sessionData.user2 || sessionData.user2.readyState !== WebSocket.OPEN) {
            sessionData.user2 = ws;
          } else {
            send(ws, {
              type: 'session-full',
              sessionId: msg.sessionId,
              message: 'Сесія повна',
            });
            return;
          }

          const partner = sessionData.user1 === ws ? sessionData.user2 : sessionData.user1;
          sessions.set(ws, { partner, sessionId: msg.sessionId });

          if (partner && partner.readyState === WebSocket.OPEN) {
            const partnerSession = sessions.get(partner);
            if (partnerSession) {
              partnerSession.partner = ws;
            }
          }

          send(ws, {
            type: 'session-joined',
            sessionId: msg.sessionId,
            message: 'Успішно приєдналися до сесії',
          });

          console.log(`🔗 Приєднання до сесії ${msg.sessionId}`);
        }

        else if (msg.type === 'chat_message') {
          const session = sessions.get(ws);
          if (!session || session.sessionId !== msg.sessionId) {
            send(ws, {
              type: 'error',
              message: 'Ви не в активній сесії або sessionId не співпадає',
            });
            return;
          }

          const messageWithMeta = {
            ...msg,
            messageId: uuidv4(),
            timestamp: Date.now(),
          };

          send(ws, { ...messageWithMeta, from: 'you' });

          if (session.partner && session.partner.readyState === WebSocket.OPEN) {
            send(session.partner, { ...messageWithMeta, from: 'partner' });
          }

          console.log(`💬 Повідомлення в сесії ${session.sessionId}: ${msg.text}`);
        }

        else if (msg.type === 'leave-session') {
          const session = sessions.get(ws);
          if (session) {
            cleanupSession(ws);
            send(ws, { type: 'session-left' });
            console.log(`❌ Покинув сесію ${session.sessionId}`);
          }
        }

        else if (msg.type === 'close server') {
          const index = queue.findIndex((entry) => entry.ws === ws);
          if (index !== -1) {
            queue.splice(index, 1);
            console.log('🗑️ Видалено з черги');
          }

          cleanupSession(ws);
        }

        else {
          send(ws, { type: 'error', message: `Невідомий тип повідомлення: ${msg.type}` });
        }

      } catch (err) {
        console.error('❌ JSON помилка:', err.message);
        send(ws, { type: 'error', message: 'Помилка обробки JSON' });
      }
    });

    ws.on('close', () => {
      console.log('🔴 Клієнт відключився');
      const index = queue.findIndex((entry) => entry.ws === ws);
      if (index !== -1) {
        queue.splice(index, 1);
        console.log('🗑️ Видалено з черги');
      }
      cleanupSession(ws);
    });

    ws.on('error', (error) => {
      console.error('🚨 WebSocket помилка:', error);
    });
  });

  console.log('✅ WebSocket сервер запущено');
  return wss;
}

module.exports = { WebSocketFriend };
