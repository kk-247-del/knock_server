 const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// --- 1. HEALTH CHECK ---
// Visit your URL in a browser. If you see "READY", the server is alive.
app.get('/', (req, res) => {
    res.status(200).send("SIGNAL_PLANE_ACTIVE");
});

const server = http.createServer(app);

// --- 2. SOCKET CONFIGURATION ---
const io = new Server(server, {
    cors: {
        origin: "*", // Required for Flutter Web
        methods: ["GET", "POST"]
    }
});

/**
 * THE GLOBAL REGISTRY
 * Maps Address (e.g., 'ABC123') to { socketId, name, address }
 */
const presenceRegistry = new Map();

io.on('connection', (socket) => {
    console.log(`📡 New Signal: ${socket.id}`);

    // --- 3. REGISTER IDENTITY ---
    socket.on('register_presence', (data) => {
        const { address, name } = data;
        if (!address || !name) return;

        const normalizedAddress = address.toUpperCase();
        
        presenceRegistry.set(normalizedAddress, {
            socketId: socket.id,
            name: name,
            address: normalizedAddress
        });

        console.log(`📝 Registered: ${name} @ ${normalizedAddress}`);
    });

    // --- 4. GLOBAL LOOKUP ---
    socket.on('lookup_address', (query, callback) => {
        console.log(`🔍 Searching for: ${query}`);
        const normalizedQuery = query.toUpperCase();
        const entry = presenceRegistry.get(normalizedQuery);

        if (entry) {
            callback({ found: true, name: entry.name, address: entry.address });
        } else {
            callback({ found: false });
        }
    });

    // --- 5. DISCONNECT CLEANUP ---
    socket.on('disconnect', () => {
        for (let [address, user] of presenceRegistry.entries()) {
            if (user.socketId === socket.id) {
                presenceRegistry.delete(address);
                console.log(`🌑 Offline: ${user.name} @ ${address}`);
                break;
            }
        }
    });
});

// --- 6. START SERVER ---
const PORT = process.env.PORT || 3000;
// Note: Binding to "0.0.0.0" is critical for Railway/Cloud deployments
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Control Plane running on port ${PORT}`);
});
