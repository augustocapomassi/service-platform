// TypeScript wrapper for the JavaScript socket module
// This allows Next.js API routes (TypeScript) to use the same socket instance
// as the custom server (JavaScript)

let socketModule: any = null;

export function notifyUser(userId: string, event: string, data: any) {
  // Lazy load the module to avoid issues during build
  if (!socketModule) {
    socketModule = require('./socket.js');
  }
  
  return socketModule.notifyUser(userId, event, data);
}

export function getIO() {
  if (!socketModule) {
    socketModule = require('./socket.js');
  }
  
  return socketModule.getIO();
}

