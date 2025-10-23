# Friend Messaging WebSocket Server

This server enables peer-to-peer messaging between Interview Life Saver app instances using room-based connections.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

The server will start on `ws://localhost:8080`

## Features

- **Room-based messaging:** Users connect using unique 8-character keys
- **Real-time communication:** WebSocket-based instant messaging
- **Automatic cleanup:** Empty rooms are cleaned up after 1 hour
- **Connection management:** Handles reconnections and participant tracking

## How it Works

### Creating a Room
1. Click the friend messaging button in the control bar
2. In settings, click "Generate Key" 
3. Share the generated 8-character key with your friend

### Joining a Room  
1. Click the friend messaging button in the control bar
2. Enter your friend's key and click "Join"
3. Start messaging!

### Messaging
- Type `@friend your message` or `/friend your message` in the main chat
- Messages appear in both the main chat and are sent to your friend
- Friend messages appear with a 💬 prefix

## Keyboard Shortcuts

- `Alt+Shift+F` - Toggle friend messaging interface

## Server Configuration

The server runs on port 8080 by default. You can modify this in `websocket-server.js` if needed.

## Architecture

```
Client 1 ←→ WebSocket Server ←→ Client 2
    │              │              │
   Room Key    Room Management   Room Key
```

- Clients connect to WebSocket server
- Server manages rooms identified by unique keys
- Messages are broadcast to all participants in the same room
- Server handles connection management and cleanup