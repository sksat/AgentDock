#!/usr/bin/env node
import { BridgeServer } from './bridge-server.js';

// Export for programmatic use
export { BridgeServer } from './bridge-server.js';
export { BrowserManager } from './browser-manager.js';
export * from './types.js';

// CLI entry point
async function main(): Promise<void> {
  const port = parseInt(process.env.BRIDGE_PORT ?? '3010', 10);

  console.log(`[ContainerBrowserBridge] Starting on port ${port}...`);

  const server = new BridgeServer({ port });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('[ContainerBrowserBridge] Shutting down...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await server.start();
    console.log(`[ContainerBrowserBridge] Ready and listening on port ${port}`);
  } catch (error) {
    console.error('[ContainerBrowserBridge] Failed to start:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')) {
  main().catch((error) => {
    console.error('[ContainerBrowserBridge] Fatal error:', error);
    process.exit(1);
  });
}
