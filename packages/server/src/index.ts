import { createServer } from './server.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const USE_MOCK = process.env.USE_MOCK === 'true' || process.env.USE_MOCK === '1';

const server = createServer({ port: PORT, host: HOST, useMock: USE_MOCK });

server.start().then(() => {
  console.log(`Claude Bridge server running at http://${HOST}:${PORT}`);
  console.log(`WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
