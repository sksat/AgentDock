/**
 * Options for launching the browser
 */
export interface BrowserControllerOptions {
  /** Whether to run in headless mode */
  headless?: boolean;
  /** Viewport size */
  viewport?: { width: number; height: number };
}

/**
 * Options for click operation
 */
export interface ClickOptions {
  /** Mouse button to click */
  button?: 'left' | 'right' | 'middle';
  /** Whether to double click */
  doubleClick?: boolean;
  /** Modifier keys to press */
  modifiers?: Array<'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'>;
}

/**
 * Options for type operation
 */
export interface TypeOptions {
  /** Whether to type slowly (one character at a time) */
  slowly?: boolean;
  /** Whether to submit (press Enter) after typing */
  submit?: boolean;
}

/**
 * A form field to fill
 */
export interface FormField {
  /** Field name (human-readable) */
  name: string;
  /** Field type */
  type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';
  /** Element reference */
  ref: string;
  /** Value to set */
  value: string;
}

/**
 * Options for taking a screenshot
 */
export interface ScreenshotOptions {
  /** Element reference (optional, for element screenshot) */
  ref?: string;
  /** Element description (for permission) */
  element?: string;
  /** File name to save */
  filename?: string;
  /** Whether to capture full page */
  fullPage?: boolean;
  /** Image format */
  type?: 'png' | 'jpeg';
}

/**
 * A console message
 */
export interface ConsoleMessage {
  /** Message type */
  type: string;
  /** Message text */
  text: string;
  /** Message location */
  location?: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
}

/**
 * A network request
 */
export interface NetworkRequest {
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Response status (if completed) */
  status?: number;
  /** Response status text */
  statusText?: string;
}

/**
 * Options for waiting
 */
export interface WaitOptions {
  /** Text to wait for to appear */
  text?: string;
  /** Text to wait for to disappear */
  textGone?: string;
  /** Time to wait in seconds */
  time?: number;
}

/**
 * Tab action
 */
export type TabAction = 'list' | 'new' | 'close' | 'select';

/**
 * Tab information
 */
export interface TabInfo {
  /** Tab index */
  index: number;
  /** Tab URL */
  url: string;
  /** Tab title */
  title: string;
}

/**
 * MCP Tool definition
 */
export interface McpTool<TInput = unknown, TOutput = unknown> {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema (Zod schema) */
  inputSchema: unknown;
  /** Handler function */
  handler: (input: TInput) => Promise<TOutput>;
}
