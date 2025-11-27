import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Server as SocketServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function initializeSocket(server: HTTPServer) {
  io = new SocketServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    path: '/api/socket',
  });

  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    // Join room for user-specific notifications
    socket.on('join-user-room', (userId: string) => {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined their room`);
    });

    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
}

// Helper function to emit notifications to specific user
export function notifyUser(userId: string, event: string, data: any) {
  const socketIO = getIO();
  socketIO.to(`user-${userId}`).emit(event, data);
  console.log(`📢 Notification sent to user ${userId}:`, event);
}

// Helper function to broadcast to all connected users
export function broadcast(event: string, data: any) {
  const socketIO = getIO();
  socketIO.emit(event, data);
  console.log(`📢 Broadcast sent to all users:`, event);
}

