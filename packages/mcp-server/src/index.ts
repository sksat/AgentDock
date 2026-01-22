import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PermissionHandler } from './permission-handler.js';
import { PlaywrightHandler } from './playwright-handler.js';
import { PortMonitorHandler } from './port-monitor-handler.js';

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

// Create Playwright handler (will connect lazily)
let playwrightHandler: PlaywrightHandler | null = null;

async function getPlaywrightHandler(): Promise<PlaywrightHandler> {
  if (!playwrightHandler) {
    playwrightHandler = new PlaywrightHandler(BRIDGE_WS_URL, SESSION_ID);
    await playwrightHandler.connect();
  }
  return playwrightHandler;
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

// ==================== AgentDock Browser Tools ====================
// IMPORTANT: When running inside AgentDock, ALWAYS use these browser tools (mcp__bridge__browser_*)
// instead of the native Playwright MCP tools (mcp__plugin_playwright_*).
// These tools stream the browser view to the AgentDock UI, allowing users to see browser activity.

// Navigate to URL
server.tool(
  'browser_navigate',
  '[AgentDock Browser - USE THIS instead of native Playwright MCP] Navigate to a URL. The browser view is streamed to the AgentDock UI.',
  {
    url: z.string().describe('The URL to navigate to'),
  },
  async ({ url }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.navigate(url);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Navigate back
server.tool(
  'browser_navigate_back',
  'Go back to the previous page',
  {},
  async () => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.navigateBack();
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Click element
server.tool(
  'browser_click',
  'Click on an element in the page',
  {
    element: z.string().describe('Human-readable element description'),
    ref: z.string().describe('Exact target element reference from the page snapshot'),
    button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button to click'),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).optional().describe('Modifier keys to press'),
    doubleClick: z.boolean().optional().describe('Whether to double-click'),
  },
  async ({ element, ref, button, modifiers, doubleClick }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.click(element, ref, { button, modifiers, doubleClick });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Hover element
server.tool(
  'browser_hover',
  'Hover over an element in the page',
  {
    element: z.string().describe('Human-readable element description'),
    ref: z.string().describe('Exact target element reference from the page snapshot'),
  },
  async ({ element, ref }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.hover(element, ref);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Type text
server.tool(
  'browser_type',
  'Type text into an editable element',
  {
    element: z.string().describe('Human-readable element description'),
    ref: z.string().describe('Exact target element reference from the page snapshot'),
    text: z.string().describe('Text to type'),
    slowly: z.boolean().optional().describe('Type one character at a time'),
    submit: z.boolean().optional().describe('Press Enter after typing'),
  },
  async ({ element, ref, text, slowly, submit }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.type(element, ref, text, { slowly, submit });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Press key
server.tool(
  'browser_press_key',
  'Press a key on the keyboard',
  {
    key: z.string().describe('Key to press (e.g., "Enter", "ArrowLeft", "a")'),
  },
  async ({ key }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.pressKey(key);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Select option
server.tool(
  'browser_select_option',
  'Select an option in a dropdown',
  {
    element: z.string().describe('Human-readable element description'),
    ref: z.string().describe('Exact target element reference from the page snapshot'),
    values: z.array(z.string()).describe('Values to select'),
  },
  async ({ element, ref, values }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.selectOption(element, ref, values);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Drag and drop
server.tool(
  'browser_drag',
  'Perform drag and drop between two elements',
  {
    startElement: z.string().describe('Human-readable source element description'),
    startRef: z.string().describe('Exact source element reference'),
    endElement: z.string().describe('Human-readable target element description'),
    endRef: z.string().describe('Exact target element reference'),
  },
  async ({ startElement, startRef, endElement, endRef }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.drag(startElement, startRef, endElement, endRef);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Fill form
server.tool(
  'browser_fill_form',
  'Fill multiple form fields at once',
  {
    fields: z.array(z.object({
      name: z.string().describe('Human-readable field name'),
      type: z.enum(['textbox', 'checkbox', 'radio', 'combobox', 'slider']).describe('Field type'),
      ref: z.string().describe('Exact target field reference'),
      value: z.string().describe('Value to fill'),
    })).describe('Fields to fill'),
  },
  async ({ fields }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.fillForm(fields);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Take snapshot
server.tool(
  'browser_snapshot',
  'Capture accessibility snapshot of the current page',
  {},
  async () => {
    try {
      const handler = await getPlaywrightHandler();
      const result = await handler.snapshot();
      return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Take screenshot
server.tool(
  'browser_take_screenshot',
  'Take a screenshot of the current page or an element',
  {
    element: z.string().optional().describe('Human-readable element description'),
    ref: z.string().optional().describe('Element reference for element screenshot'),
    fullPage: z.boolean().optional().describe('Take full page screenshot'),
  },
  async ({ element, ref, fullPage }) => {
    try {
      const handler = await getPlaywrightHandler();
      const result = await handler.takeScreenshot({ element, ref, fullPage });
      return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Get console messages
server.tool(
  'browser_console_messages',
  'Get console messages from the page',
  {
    level: z.enum(['error', 'warning', 'info', 'debug']).optional().describe('Minimum log level'),
  },
  async ({ level }) => {
    try {
      const handler = await getPlaywrightHandler();
      const result = await handler.getConsoleMessages(level);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Get network requests
server.tool(
  'browser_network_requests',
  'Get network requests made by the page',
  {
    includeStatic: z.boolean().optional().default(false).describe('Include static resources'),
  },
  async ({ includeStatic }) => {
    try {
      const handler = await getPlaywrightHandler();
      const result = await handler.getNetworkRequests(includeStatic);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Evaluate JavaScript
server.tool(
  'browser_evaluate',
  'Evaluate JavaScript in the page context',
  {
    function: z.string().describe('JavaScript function to execute'),
    element: z.string().optional().describe('Human-readable element description'),
    ref: z.string().optional().describe('Element reference to pass to function'),
  },
  async (input) => {
    try {
      const handler = await getPlaywrightHandler();
      const result = await handler.evaluate(input.function, input.element, input.ref);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Wait for condition
server.tool(
  'browser_wait_for',
  'Wait for text to appear/disappear or a specified time',
  {
    text: z.string().optional().describe('Text to wait for'),
    textGone: z.string().optional().describe('Text to wait to disappear'),
    time: z.number().optional().describe('Time to wait in seconds'),
  },
  async ({ text, textGone, time }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.waitFor({ text, textGone, time });
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Handle dialog
server.tool(
  'browser_handle_dialog',
  'Handle a dialog (alert, confirm, prompt)',
  {
    accept: z.boolean().describe('Whether to accept the dialog'),
    promptText: z.string().optional().describe('Text to enter for prompt dialog'),
  },
  async ({ accept, promptText }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.handleDialog(accept, promptText);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Resize browser
server.tool(
  'browser_resize',
  'Resize the browser window',
  {
    width: z.number().describe('Width in pixels'),
    height: z.number().describe('Height in pixels'),
  },
  async ({ width, height }) => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.resize(width, height);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Manage tabs
server.tool(
  'browser_tabs',
  'List, create, close, or select browser tabs',
  {
    action: z.enum(['list', 'new', 'close', 'select']).describe('Tab operation'),
    index: z.number().optional().describe('Tab index for close/select'),
  },
  async ({ action, index }) => {
    try {
      const handler = await getPlaywrightHandler();
      const result = await handler.manageTabs(action, index);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// Close browser
server.tool(
  'browser_close',
  'Close the browser',
  {},
  async () => {
    try {
      const handler = await getPlaywrightHandler();
      await handler.close();
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }) }] };
    }
  }
);

// ==================== Port Monitor Tool ====================
// This tool helps agents identify which ports are being used by processes
// spawned in this session, useful when multiple dev servers are running.

const portMonitorHandler = new PortMonitorHandler();

server.tool(
  'port_monitor',
  'Get the current session process tree and listening ports. ' +
    'Use this to find out which ports dev servers (like Vite, Next.js) are using. ' +
    'Helps avoid port confusion when multiple sessions run dev servers simultaneously.',
  {
    includeAllProcesses: z
      .boolean()
      .optional()
      .describe('Include all processes in the tree, not just those listening on ports'),
    portRange: z
      .object({
        min: z.number().int().min(1).max(65535).describe('Minimum port number'),
        max: z.number().int().min(1).max(65535).describe('Maximum port number'),
      })
      .optional()
      .describe('Filter results to only include ports within this range'),
  },
  async ({ includeAllProcesses, portRange }) => {
    try {
      const result = await portMonitorHandler.getSessionPorts({
        includeAllProcesses,
        portRange,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
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
    if (playwrightHandler) {
      await playwrightHandler.disconnect();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    if (permissionHandler) {
      await permissionHandler.disconnect();
    }
    if (playwrightHandler) {
      await playwrightHandler.disconnect();
    }
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
