const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

app.get('/', (req, res) => {
    res.status(200).send("SIGNAL_PLANE_ACTIVE");
});

const server = http.createServer(app);

const io = new Server(server, {
    pingTimeout: 60000, // Handle long-lived mobile/web connections
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const presenceRegistry = new Map();

io.on('connection', (socket) => {
    console.log(`📡 New Connection: ${socket.id}`);

    // --- IDENTITY ---
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

    // --- ADDRESS LOOKUP ---
    socket.on('lookup_address', (query, callback) => {
        const entry = presenceRegistry.get(query.toUpperCase());
        entry ? callback({ found: true, name: entry.name }) : callback({ found: false });
    });

    // --- THE "KNOCK" (Proposals) ---
    socket.on('send_proposal', (data) => {
        const target = presenceRegistry.get(data.toAddress.toUpperCase());
        if (target) {
            io.to(target.socketId).emit('incoming_proposal', {
                id: `KNK-${Date.now()}`,
                fromName: data.fromName,
                fromAddress: data.fromAddress,
                proposedTime: data.proposedTime
            });
            console.log(`🚪 Knock: ${data.fromName} -> ${data.toAddress}`);
        }
    });

    socket.on('respond_to_proposal', (data) => {
        // Logic to notify the sender if accepted/rejected
        // For 'accept', you'd typically emit 'proposal_accepted' back
    });

    // --- THE SIGNAL RELAY (Live Text / Reveal Frames) ---
    // Fixes: Why your Moment Surface isn't updating
    socket.on('live_signal', (payload) => {
        // Broadcast the signal to all other users (simplest for 1-on-1 moments)
        // In a strictly 1-on-1 app, you'd target a specific socketId here.
        socket.broadcast.emit('live_signal', payload);
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        for (let [address, user] of presenceRegistry.entries()) {
            if (user.socketId === socket.id) {
                presenceRegistry.delete(address);
                console.log(`🌑 Offline: ${address}`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Control Plane running on port ${PORT}`);
});
