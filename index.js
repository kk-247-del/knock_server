const io = require("socket.io")(3000, {
  cors: { origin: "*" }
});

// Memory Store: { address: { name, socketId } }
const registry = {}; 
// Proposal Store: { propId: { data, timer } }
const proposals = new Map();

console.log("Presence Registry Server running on port 3000");

io.on("connection", (socket) => {
  
  // 1. Register Address & Nickname
  socket.on("register_presence", ({ address, name }) => {
    registry[address] = { name, socketId: socket.id, address };
    socket.address = address; // Attach for easy lookup on disconnect
    console.log(`Registered: ${name} (${address})`);
  });

  // 2. Global Identity Lookup
  socket.on("lookup_address", (targetAddress, callback) => {
    const user = registry[targetAddress];
    if (user) {
      callback({ found: true, name: user.name, address: user.address });
    } else {
      callback({ found: false });
    }
  });

  // 3. Time Proposal Logic
  socket.on("send_proposal", (data) => {
    const { toAddress, fromName, fromAddress, proposedTime } = data;
    const recipient = registry[toAddress];

    if (recipient) {
      const propId = `prop_${Math.random().toString(36).substr(2, 9)}`;
      
      // Notify Recipient
      io.to(recipient.socketId).emit("incoming_proposal", {
        id: propId,
        fromName,
        fromAddress,
        proposedTime
      });

      // ─── 30-MINUTE AUTO DESTRUCT ───
      const timer = setTimeout(() => {
        if (proposals.has(propId)) {
          proposals.delete(propId);
          console.log(`Proposal ${propId} expired silently.`);
          // Per requirements: No feedback is sent to the sender on expiration
        }
      }, 30 * 60 * 1000);

      proposals.set(propId, { ...data, timer });
    }
  });

  // 4. Response Handler (ACCEPT, DECLINE, COUNTER)
  socket.on("respond_to_proposal", ({ propId, action, counterTime }) => {
    const prop = proposals.get(propId);
    if (!prop) return;

    // Clear the auto-destruct timer as action was taken
    clearTimeout(prop.timer);

    const sender = registry[prop.fromAddress];
    if (sender) {
      io.to(sender.socketId).emit("proposal_response", {
        propId,
        action, // "ACCEPT", "DECLINE", or "COUNTER"
        newTime: action === "COUNTER" ? counterTime : prop.proposedTime
      });
    }

    // Remove from active memory unless it's a counter-loop
    if (action !== "COUNTER") {
      proposals.delete(propId);
    }
  });

  socket.on("disconnect", () => {
    if (socket.address) {
      delete registry[socket.address];
      console.log(`Deregistered: ${socket.address}`);
    }
  });
});
