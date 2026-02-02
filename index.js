 const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all connections for mobile/web testing
    methods: ["GET", "POST"]
  }
});

/**
 * THE GLOBAL REGISTRY
 * Maps Address (e.g., 'ABC123') to { socketId, name, address }
 */
const presenceRegistry = new Map();

/**
 * THE PROPOSAL TRACKER
 * Maps ProposalID to { fromSocket, toSocket, data }
 */
const activeProposals = new Map();

io.on('connection', (socket) => {
  console.log(`📡 New Signal: ${socket.id}`);

  // ─── 1. REGISTER IDENTITY ───
  socket.on('register_presence', (data) => {
    const { address, name } = data;
    if (!address || !name) return;

    const normalizedAddress = address.toUpperCase();
    
    // Store user in registry
    presenceRegistry.set(normalizedAddress, {
      socketId: socket.id,
      name: name,
      address: normalizedAddress
    });

    console.log(`📝 Registered: ${name} @ ${normalizedAddress}`);
  });

  // ─── 2. GLOBAL LOOKUP ───
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

  // ─── 3. SEND PROPOSAL (KNOCK) ───
  socket.on('send_proposal', (data) => {
    const { toAddress, fromName, fromAddress, proposedTime } = data;
    const target = presenceRegistry.get(toAddress.toUpperCase());

    if (target) {
      const propId = `PROP-${Math.random().toString(36).substr(2, 9)}`;
      
      // Save proposal details
      activeProposals.set(propId, {
        senderId: socket.id,
        receiverId: target.socketId
      });

      // Emit to the recipient
      io.to(target.socketId).emit('incoming_proposal', {
        id: propId,
        fromName,
        fromAddress,
        proposedTime
      });

      console.log(`🚀 Knock sent from ${fromAddress} to ${toAddress}`);
    }
  });

  // ─── 4. RESPOND TO PROPOSAL (ACCEPTED / DECLINED) ───
  socket.on('respond_to_proposal', (data) => {
    const { propId, action, counterTime } = data;
    const proposal = activeProposals.get(propId);

    if (proposal) {
      // Notify the original sender
      io.to(proposal.senderId).emit('proposal_response', {
        propId,
        action, // "ACCEPT", "DECLINE", "COUNTER"
        newTime: counterTime
      });

      console.log(`🤝 Proposal ${propId} was ${action}`);

      // Cleanup
      activeProposals.delete(propId);
    }
  });

  // ─── 5. DISCONNECT CLEANUP ───
  socket.on('disconnect', () => {
    // Remove user from registry on disconnect
    for (let [address, user] of presenceRegistry.entries()) {
      if (user.socketId === socket.id) {
        presenceRegistry.delete(address);
        console.log(`🌑 Offline: ${user.name} @ ${address}`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Control Plane running on port ${PORT}`);
});
