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
    containerImage: string | undefined;
  } = {
    dbPath: process.env.CLAUDE_BRIDGE_DB_PATH || './data.db',
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',
    useMock: process.env.USE_MOCK === 'true' || process.env.USE_MOCK === '1',
    containerEnabled: process.env.CONTAINER_ENABLED === 'true' || process.env.CONTAINER_ENABLED === '1',
    containerImage: process.env.CONTAINER_IMAGE,
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
      case '--container':
        result.containerEnabled = true;
        break;
      case '--container-image':
        if (nextArg) {
          result.containerImage = nextArg;
          i++;
        }
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
  if (config.containerEnabled) {
    console.log(`Container mode: enabled (image: ${config.containerImage})`);
  }
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
