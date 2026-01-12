import { createServer } from './server.js';
import { testScenarios } from './test-scenarios.js';

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    dbPath: process.env.CLAUDE_BRIDGE_DB_PATH || './data.db',
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',
    useMock: process.env.USE_MOCK === 'true' || process.env.USE_MOCK === '1',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--db-path':
        if (nextArg) {
          result.dbPath = nextArg;
          i++;
        }
        break;
      case '--port':
        if (nextArg) {
          result.port = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--host':
        if (nextArg) {
          result.host = nextArg;
          i++;
        }
        break;
      case '--mock':
        result.useMock = true;
        break;
    }
  }

  return result;
}

const config = parseArgs();

const server = createServer({
  port: config.port,
  host: config.host,
  useMock: config.useMock,
  mockScenarios: config.useMock ? testScenarios : [],
  dbPath: config.dbPath,
});

server.start().then(() => {
  console.log(`Claude Bridge server running at http://${config.host}:${config.port}`);
  console.log(`WebSocket endpoint: ws://${config.host}:${config.port}/ws`);
  console.log(`Database: ${config.dbPath}`);
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
