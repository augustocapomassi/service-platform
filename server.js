const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Create the HTTP server
  const server = createServer();
  
  // Initialize Socket.IO FIRST - this is critical!
  // Socket.IO needs to attach its handlers before Next.js
  const { initializeSocket } = require('./server/socket.js');
  initializeSocket(server);
  console.log('✅ Socket.IO initialized on HTTP server');
  
  // Now attach Next.js handler
  // Socket.IO will intercept /api/socket requests before they reach Next.js
  server.on('request', async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      
      // Log all requests for debugging
      if (parsedUrl.pathname && parsedUrl.pathname.startsWith('/api/socket')) {
        console.log('🔌 Socket.IO request detected by Next.js handler:', parsedUrl.pathname);
        console.log('⚠️ This should have been handled by Socket.IO already!');
      }
      
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('internal server error');
      }
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO available at ws://${hostname}:${port}/api/socket`);
  });
});

