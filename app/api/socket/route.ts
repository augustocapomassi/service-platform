// This is a placeholder route for Socket.IO
// Socket.IO is initialized in server.js
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    message: 'Socket.IO is running',
    note: 'Use the Socket.IO client to connect to /api/socket'
  });
}

