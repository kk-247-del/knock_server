// server.js
// Presence Knock Relay Server
// Stateless, ephemeral, WebSocket-only

import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';

/* ───────────────── CONFIG ───────────────── */

const PORT = process.env.PORT || 10000;
const KNOCK_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

/* ───────────────── STATE ───────────────── */

// knockName -> { socket, expiresAt }
const registry = new Map();

/* ───────────────── SERVER ───────────────── */

const server = http.createServer();
const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log(`[KNOCK] Relay listening on :${PORT}`);
});

/* ───────────────── HELPERS ───────────────── */

function now() {
  return Date.now();
}

function cleanupExpired() {
  const t = now();
  for (const [knock, entry] of registry.entries()) {
    if (entry.expiresAt <= t) {
      try {
        entry.socket.close();
      } catch {}
      registry.delete(knock);
    }
  }
}

// Run GC every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

/* ───────────────── CONNECTION ───────────────── */

wss.on('connection', (socket) => {
  let registeredKnock = null;

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      /* ───── REGISTER ───── */
      case 'register': {
        const knock = String(msg.knock || '').trim().toLowerCase();
        if (!knock || knock.length > 32) return;

        // Replace existing registration
        registry.set(knock, {
          socket,
          expiresAt: now() + KNOCK_TTL_MS,
        });

        registeredKnock = knock;

        socket.send(
          JSON.stringify({
            type: 'registered',
            knock,
            expiresIn: KNOCK_TTL_MS / 1000,
          }),
        );

        console.log(`[KNOCK] Registered: ${knock}`);
        break;
      }

      /* ───── KNOCK REQUEST ───── */
      case 'knock_request': {
        const { to } = msg;
        if (!to) return;

        const target = registry.get(String(to).toLowerCase());
        if (!target) return; // silent drop

        target.socket.send(JSON.stringify(msg));
        break;
      }

      /* ───── KNOCK RESPONSE ───── */
      case 'knock_response': {
        const { to } = msg;
        if (!to) return;

        const target = registry.get(String(to).toLowerCase());
        if (!target) return;

        target.socket.send(JSON.stringify(msg));
        break;
      }

      default:
        break;
    }
  });

  socket.on('close', () => {
    if (registeredKnock && registry.get(registeredKnock)?.socket === socket) {
      registry.delete(registeredKnock);
      console.log(`[KNOCK] Disconnected: ${registeredKnock}`);
    }
  });
});
