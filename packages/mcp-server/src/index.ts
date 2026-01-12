import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PermissionHandler } from './permission-handler.js';

// Get bridge server URL from environment
const BRIDGE_WS_URL = process.env.BRIDGE_WS_URL || 'ws://localhost:3001/ws';
const SESSION_ID = process.env.SESSION_ID || 'default';

// Create MCP server
const server = new McpServer({
  name: 'agent-dock',
  version: '0.1.0',
});

// Create permission handler (will connect lazily)
let permissionHandler: PermissionHandler | null = null;

async function getPermissionHandler(): Promise<PermissionHandler> {
  if (!permissionHandler) {
    permissionHandler = new PermissionHandler(BRIDGE_WS_URL);
    await permissionHandler.connect();
  }
  return permissionHandler;
}

// Define the permission_prompt tool
// This tool is called by Claude CLI when it needs permission to execute a tool
server.tool(
  'permission_prompt',
  'Request user permission for a tool execution. Returns allow/deny decision from the user.',
  {
    tool_name: z.string().describe('Name of the tool requesting permission'),
    input: z.any().describe('Input parameters for the tool'),
  },
  async ({ tool_name, input }) => {
    try {
      const handler = await getPermissionHandler();

      const result = await handler.requestPermission({
        sessionId: SESSION_ID,
        toolName: tool_name,
        input,
      });

      // Return the result in the format expected by Claude CLI
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      // On error, deny the permission
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              behavior: 'deny',
              message: `Permission request failed: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle cleanup on exit
  process.on('SIGINT', async () => {
    if (permissionHandler) {
      await permissionHandler.disconnect();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    if (permissionHandler) {
      await permissionHandler.disconnect();
    }
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
