import { createServer } from './server.js';
import { testScenarios } from './test-scenarios.js';

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result: {
    dbPath: string;
    port: number;
    host: string;
    useMock: boolean;
    containerEnabled: boolean;
    containerImage: string;
  } = {
    dbPath: process.env.CLAUDE_BRIDGE_DB_PATH || './data.db',
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',
    useMock: process.env.USE_MOCK === 'true' || process.env.USE_MOCK === '1',
    // Container mode is enabled by default; set CONTAINER_DISABLED=true to disable
    containerEnabled: process.env.CONTAINER_DISABLED !== 'true' && process.env.CONTAINER_DISABLED !== '1',
    containerImage: process.env.CONTAINER_IMAGE || 'localhost/claude-code:local',
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
      case '--no-container':
        result.containerEnabled = false;
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
  containerEnabled: config.containerEnabled,
  containerImage: config.containerImage,
});

server.start().then(() => {
  console.log(`Claude Bridge server running at http://${config.host}:${config.port}`);
  console.log(`WebSocket endpoint: ws://${config.host}:${config.port}/ws`);
  console.log(`Database: ${config.dbPath}`);
  console.log(`Container mode: ${config.containerEnabled ? `enabled (image: ${config.containerImage})` : 'disabled'}`);
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
