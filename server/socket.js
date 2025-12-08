const { Server: SocketServer } = require('socket.io');

let io = null;

function initializeSocket(server) {
  // Allow all origins in development for easier debugging
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000']
    : '*'; // Allow all origins in development
  
  console.log('🔌 Initializing Socket.IO server...');
  console.log('📊 CORS origin:', allowedOrigins);
  console.log('📊 Path: /api/socket');
  
  io = new SocketServer(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/api/socket',
    transports: ['websocket', 'polling'],
    allowEIO3: true,
  });
  
  console.log('✅ Socket.IO server initialized');

  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    console.log(`📊 Total connected sockets: ${io.sockets.sockets.size}`);

    // Send a test event to verify connection
    socket.emit('test-event', { message: 'Socket connection test', timestamp: Date.now() });
    console.log('🧪 Sent test event to new client');
    
    // Test broadcast immediately to verify it works
    setTimeout(() => {
      console.log('🧪 Testing broadcast after connection...');
      console.log('🧪 Connected sockets:', io.sockets.sockets.size);
      try {
        console.log('🧪 Calling broadcast function...');
        broadcast('test-broadcast', { message: 'Test broadcast from server', timestamp: Date.now() });
        console.log('✅ Test broadcast sent successfully');
        
        // Also test direct emit
        console.log('🧪 Testing direct io.emit...');
        io.emit('test-direct-io-emit', { message: 'Direct io.emit test', timestamp: Date.now() });
        console.log('✅ Direct io.emit test sent');
      } catch (error) {
        console.error('❌ Test broadcast failed:', error);
        console.error('❌ Error stack:', error.stack);
      }
    }, 1000);

    // Join room for user-specific notifications
    socket.on('join-user-room', (userId) => {
      const room = `user-${userId}`;
      socket.join(room);
      console.log(`✅ User ${userId} joined room: ${room}`);
      console.log(`✅ Socket ${socket.id} is now in room ${room}`);
      
      // Verify room membership
      const roomSockets = io.sockets.adapter.rooms.get(room);
      const socketCount = roomSockets ? roomSockets.size : 0;
      console.log(`📊 Room ${room} now has ${socketCount} socket(s)`);
      
      // List all sockets in the room
      if (roomSockets) {
        console.log(`📋 Sockets in room ${room}:`, Array.from(roomSockets));
      }
      
      // Verify this socket is in the room
      const socketRooms = Array.from(socket.rooms);
      console.log(`📋 Socket ${socket.id} is in rooms:`, socketRooms);
    });
    
    // Handle test event request
    socket.on('request-test-event', (data) => {
      console.log('🧪 Test event requested by client:', socket.id, data);
      socket.emit('test-event', { 
        message: 'Test event from server', 
        timestamp: Date.now(),
        requestedAt: data.timestamp 
      });
      console.log('✅ Test event sent to client:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Client disconnected:', socket.id, 'reason:', reason);
      console.log(`📊 Remaining connected sockets: ${io.sockets.sockets.size}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    console.error('❌ [getIO] Socket.IO not initialized!');
    console.error('❌ [getIO] This means initializeSocket was not called or failed');
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  console.log('✅ [getIO] Socket.IO instance retrieved successfully');
  console.log('✅ [getIO] Socket.IO instance ID:', io.id || 'no id');
  console.log('✅ [getIO] Connected sockets:', io.sockets.sockets.size);
  return io;
}

// Helper function to emit notifications to specific user
function notifyUser(userId, event, data) {
  try {
    console.log(`\n📤 ========== [SERVER] SENDING EVENT TO USER ==========`);
    console.log(`📤 [SERVER] Event: ${event}`);
    console.log(`📤 [SERVER] User ID: ${userId}`);
    console.log(`📤 [SERVER] Timestamp: ${new Date().toISOString()}`);
    console.log(`📤 [SERVER] Data:`, JSON.stringify(data, null, 2));
    
    const socketIO = getIO();
    const room = `user-${userId}`;
    
    // Get all sockets in the room
    const roomSockets = socketIO.sockets.adapter.rooms.get(room);
    const socketCount = roomSockets ? roomSockets.size : 0;
    
    console.log(`📤 [SERVER] Room: ${room}, Sockets in room: ${socketCount}`);
    
    if (socketCount === 0) {
      console.warn(`⚠️ [SERVER] WARNING: No sockets in room ${room}! Event will not be received by user ${userId}.`);
      console.warn(`⚠️ [SERVER] Available rooms:`, Array.from(socketIO.sockets.adapter.rooms.keys()));
      console.warn(`⚠️ [SERVER] Total connected sockets: ${socketIO.sockets.sockets.size}`);
      
      // List all connected sockets and their rooms
      socketIO.sockets.sockets.forEach((sock, socketId) => {
        const rooms = Array.from(sock.rooms);
        console.log(`  → [SERVER] Socket ${socketId} is in rooms:`, rooms);
      });
      console.log(`📤 ========== [SERVER] END SENDING EVENT (NO USER IN ROOM) ==========\n`);
      return;
    }
    
    socketIO.to(room).emit(event, data);
    console.log(`✅ [SERVER] Event "${event}" sent to room ${room} with ${socketCount} socket(s):`, Array.from(roomSockets));
    console.log(`📤 ========== [SERVER] END SENDING EVENT TO USER ==========\n`);
  } catch (error) {
    console.error(`❌ [SERVER] ========== ERROR SENDING EVENT TO USER ==========`);
    console.error(`❌ [SERVER] Event: ${event}, User: ${userId}`);
    console.error(`❌ [SERVER] Error:`, error);
    console.error(`❌ [SERVER] ========== END ERROR ==========\n`);
    throw error;
  }
}

// Helper function to broadcast to all connected users
function broadcast(event, data) {
  try {
    console.log(`\n📤 ========== [SERVER] SENDING EVENT ==========`);
    console.log(`📤 [SERVER] Event: ${event}`);
    console.log(`📤 [SERVER] Timestamp: ${new Date().toISOString()}`);
    console.log(`📤 [SERVER] Data:`, JSON.stringify(data, null, 2));
    
    const socketIO = getIO();
    const connectedSockets = socketIO.sockets.sockets.size;
    
    console.log(`📤 [SERVER] Connected sockets: ${connectedSockets}`);
    
    if (connectedSockets === 0) {
      console.warn('⚠️ [SERVER] WARNING: No connected sockets! Event will not be received by any client.');
      console.warn('⚠️ [SERVER] This usually means clients are not connected or the socket server is not running.');
      console.log(`📤 ========== [SERVER] END SENDING EVENT (NO CLIENTS) ==========\n`);
      return;
    }
    
    // Emit to all connected sockets
    console.log(`📤 [SERVER] Emitting event "${event}" to ${connectedSockets} socket(s)...`);
    console.log(`📤 [SERVER] Socket.IO instance:`, socketIO ? 'exists' : 'NULL');
    console.log(`📤 [SERVER] Socket.IO.emit function:`, typeof socketIO.emit);
    
    // Verify we're using the same instance
    if (socketIO !== io) {
      console.error('❌ [SERVER] CRITICAL: socketIO instance is different from io!');
      console.error('❌ [SERVER] This means we have multiple Socket.IO instances!');
    }
    
    socketIO.emit(event, data);
    console.log(`✅ [SERVER] Event "${event}" emitted successfully`);
    
    // Also try emitting directly to verify it works
    console.log(`📤 [SERVER] Also emitting directly via io.emit...`);
    io.emit(event, data);
    console.log(`✅ [SERVER] Direct io.emit also completed`);
    
    // Also log which sockets received it (for debugging)
    let socketCount = 0;
    const socketIds = [];
    socketIO.sockets.sockets.forEach((socket, socketId) => {
      const isConnected = socket.connected;
      const rooms = Array.from(socket.rooms);
      console.log(`  → [SERVER] Socket ${socketId}: connected=${isConnected}, rooms=[${rooms.join(', ')}]`);
      socketIds.push(socketId);
      socketCount++;
    });
    
    if (socketCount !== connectedSockets) {
      console.warn(`⚠️ [SERVER] Mismatch: Expected ${connectedSockets} sockets but iterated ${socketCount}`);
    }
    
    console.log(`📤 [SERVER] Event sent to ${socketCount} socket(s):`, socketIds);
    console.log(`📤 ========== [SERVER] END SENDING EVENT ==========\n`);
  } catch (error) {
    console.error(`❌ [SERVER] ========== ERROR SENDING EVENT ==========`);
    console.error(`❌ [SERVER] Event: ${event}`);
    console.error(`❌ [SERVER] Error:`, error);
    console.error(`❌ [SERVER] Error message:`, error.message);
    console.error(`❌ [SERVER] Error stack:`, error.stack);
    console.error(`❌ [SERVER] ========== END ERROR ==========\n`);
    throw error;
  }
}

module.exports = {
  initializeSocket,
  getIO,
  notifyUser,
  broadcast,
};

