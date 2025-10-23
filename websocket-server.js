const WebSocket = require('ws');
const crypto = require('crypto');

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// Store rooms and connections
const rooms = new Map(); // roomId -> { clients: Set<WebSocket>, messages: Array }
const clientRooms = new Map(); // WebSocket -> roomId

// Generate a unique room key
function generateRoomKey() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 character key
}

// Broadcast message to all clients in a room except sender
function broadcastToRoom(roomId, message, sender) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.clients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Send message to specific client
function sendToClient(client, message) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'create_room':
          // Create a new room
          const roomKey = generateRoomKey();
          const newRoom = {
            clients: new Set([ws]),
            messages: [],
            createdAt: new Date()
          };
          
          rooms.set(roomKey, newRoom);
          clientRooms.set(ws, roomKey);
          
          sendToClient(ws, {
            type: 'room_created',
            roomKey: roomKey,
            success: true
          });
          
          console.log(`Room created: ${roomKey}`);
          break;

        case 'join_room':
          const { roomKey: joinKey } = message;
          const existingRoom = rooms.get(joinKey);
          
          if (!existingRoom) {
            sendToClient(ws, {
              type: 'join_error',
              error: 'Room not found',
              success: false
            });
            break;
          }
          
          // Leave current room if in one
          const currentRoom = clientRooms.get(ws);
          if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) {
              room.clients.delete(ws);
              if (room.clients.size === 0) {
                rooms.delete(currentRoom);
                console.log(`Room ${currentRoom} deleted (empty)`);
              }
            }
          }
          
          // Join new room
          existingRoom.clients.add(ws);
          clientRooms.set(ws, joinKey);
          
          sendToClient(ws, {
            type: 'room_joined',
            roomKey: joinKey,
            success: true,
            participantCount: existingRoom.clients.size
          });
          
          // Send recent messages to new participant
          existingRoom.messages.slice(-10).forEach(msg => {
            sendToClient(ws, {
              type: 'message',
              ...msg
            });
          });
          
          // Notify other participants
          broadcastToRoom(joinKey, {
            type: 'participant_joined',
            participantCount: existingRoom.clients.size
          }, ws);
          
          console.log(`Client joined room: ${joinKey}`);
          break;

        case 'send_message':
          const roomId = clientRooms.get(ws);
          if (!roomId) {
            sendToClient(ws, {
              type: 'error',
              error: 'Not in a room',
              success: false
            });
            break;
          }
          
          const room = rooms.get(roomId);
          if (!room) {
            sendToClient(ws, {
              type: 'error',
              error: 'Room not found',
              success: false
            });
            break;
          }
          
          const messageData = {
            id: crypto.randomUUID(),
            text: message.text,
            timestamp: new Date().toISOString(),
            sender: message.sender || 'Anonymous'
          };
          
          // Store message in room history
          room.messages.push(messageData);
          
          // Keep only last 50 messages
          if (room.messages.length > 50) {
            room.messages = room.messages.slice(-50);
          }
          
          // Broadcast to all clients in room
          room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              sendToClient(client, {
                type: 'message',
                ...messageData
              });
            }
          });
          
          console.log(`Message sent in room ${roomId}: ${message.text.substring(0, 50)}...`);
          break;

        case 'leave_room':
          const leaveRoomId = clientRooms.get(ws);
          if (leaveRoomId) {
            const leaveRoom = rooms.get(leaveRoomId);
            if (leaveRoom) {
              leaveRoom.clients.delete(ws);
              
              // Notify other participants
              broadcastToRoom(leaveRoomId, {
                type: 'participant_left',
                participantCount: leaveRoom.clients.size
              }, ws);
              
              // Delete room if empty
              if (leaveRoom.clients.size === 0) {
                rooms.delete(leaveRoomId);
                console.log(`Room ${leaveRoomId} deleted (empty)`);
              }
            }
            clientRooms.delete(ws);
            
            sendToClient(ws, {
              type: 'room_left',
              success: true
            });
          }
          break;

        case 'ping':
          sendToClient(ws, { type: 'pong' });
          break;

        default:
          sendToClient(ws, {
            type: 'error',
            error: 'Unknown message type',
            success: false
          });
      }
    } catch (error) {
      console.error('Error processing message:', error);
      sendToClient(ws, {
        type: 'error',
        error: 'Invalid message format',
        success: false
      });
    }
  });

  ws.on('close', () => {
    // Clean up when client disconnects
    const roomId = clientRooms.get(ws);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.clients.delete(ws);
        
        // Notify other participants
        broadcastToRoom(roomId, {
          type: 'participant_left',
          participantCount: room.clients.size
        }, ws);
        
        // Delete room if empty
        if (room.clients.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        }
      }
      clientRooms.delete(ws);
    }
    
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  // Send welcome message
  sendToClient(ws, {
    type: 'connected',
    message: 'Connected to messaging server',
    success: true
  });
});

// Clean up old empty rooms periodically
setInterval(() => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  rooms.forEach((room, roomId) => {
    if (room.clients.size === 0 && room.createdAt < oneHourAgo) {
      rooms.delete(roomId);
      console.log(`Cleaned up old empty room: ${roomId}`);
    }
  });
}, 15 * 60 * 1000); // Run every 15 minutes

console.log('WebSocket server running on port 8080');
console.log('Active rooms:', rooms.size);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down WebSocket server...');
  wss.clients.forEach(ws => {
    ws.close();
  });
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});