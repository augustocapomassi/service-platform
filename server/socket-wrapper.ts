// TypeScript wrapper for the JavaScript socket module
// This allows Next.js API routes (TypeScript) to use the same socket instance
// as the custom server (JavaScript)

let socketModule: any = null;

function loadSocketModule() {
  if (!socketModule) {
    try {
      // Next.js webpack can't resolve dynamic requires
      // We need to bypass webpack's static analysis
      // Solution: Use eval to create a dynamic require that webpack can't analyze
      const path = require('path');
      const fs = require('fs');
      
      // Get the absolute path to socket.js
      const socketPath = path.join(process.cwd(), 'server', 'socket.js');
      console.log('📢 [socket-wrapper] Attempting to load:', socketPath);
      
      if (!fs.existsSync(socketPath)) {
        throw new Error(`socket.js not found at: ${socketPath}`);
      }
      
      // Use eval to bypass webpack's static analysis
      // This allows us to require a file that webpack doesn't know about
      const requireFunc = eval('require');
      socketModule = requireFunc(socketPath);
      
      console.log('📢 [socket-wrapper] Socket module loaded successfully');
      console.log('📢 [socket-wrapper] Module exports:', Object.keys(socketModule));
    } catch (error: any) {
      console.error('❌ [socket-wrapper] Error loading socket module:', error);
      console.error('❌ [socket-wrapper] Error message:', error?.message);
      console.error('❌ [socket-wrapper] Error code:', error?.code);
      throw error;
    }
  }
}

export function notifyUser(userId: string, event: string, data: any) {
  loadSocketModule();
  return socketModule.notifyUser(userId, event, data);
}

export function getIO() {
  loadSocketModule();
  return socketModule.getIO();
}

export function broadcast(event: string, data: any) {
  try {
    console.log(`📢 [socket-wrapper] ========== BROADCAST CALLED ==========`);
    console.log(`📢 [socket-wrapper] Event: ${event}`);
    console.log(`📢 [socket-wrapper] Data:`, JSON.stringify(data, null, 2));
    
    // Load the socket module if not already loaded
    loadSocketModule();
    
    if (!socketModule.broadcast) {
      console.error('❌ [socket-wrapper] broadcast function not found in module!');
      console.error('❌ [socket-wrapper] Available exports:', Object.keys(socketModule));
      throw new Error('broadcast function not found in socket module');
    }
    
    console.log('📢 [socket-wrapper] Calling broadcast function...');
    const result = socketModule.broadcast(event, data);
    console.log('📢 [socket-wrapper] Broadcast function completed successfully');
    return result;
  } catch (error: any) {
    console.error('❌ [socket-wrapper] ========== ERROR IN BROADCAST ==========');
    console.error('❌ [socket-wrapper] Error type:', typeof error);
    console.error('❌ [socket-wrapper] Error:', error);
    console.error('❌ [socket-wrapper] Error message:', error?.message);
    console.error('❌ [socket-wrapper] Error name:', error?.name);
    console.error('❌ [socket-wrapper] Error code:', error?.code);
    console.error('❌ [socket-wrapper] Error stack:', error?.stack);
    throw error;
  }
}
