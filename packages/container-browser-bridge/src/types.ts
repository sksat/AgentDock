/**
 * Commands sent from host server to container bridge
 */
export type BridgeCommand =
  | LaunchBrowserCommand
  | CloseBrowserCommand
  | BrowserNavigateCommand
  | BrowserNavigateBackCommand
  | BrowserClickCommand
  | BrowserHoverCommand
  | BrowserTypeCommand
  | BrowserPressKeyCommand
  | BrowserScrollCommand
  | BrowserSelectOptionCommand
  | BrowserDragCommand
  | BrowserFillFormCommand
  | BrowserSnapshotCommand
  | BrowserScreenshotCommand
  | BrowserConsoleMessagesCommand
  | BrowserNetworkRequestsCommand
  | BrowserEvaluateCommand
  | BrowserWaitForCommand
  | BrowserHandleDialogCommand
  | BrowserResizeCommand
  | BrowserTabsCommand
  | StartScreencastCommand
  | StopScreencastCommand;

export interface LaunchBrowserCommand {
  type: 'launch_browser';
  options?: {
    headless?: boolean;
    viewport?: { width: number; height: number };
  };
}

export interface CloseBrowserCommand {
  type: 'close_browser';
}

export interface BrowserNavigateCommand {
  type: 'browser_navigate';
  url: string;
}

export interface BrowserNavigateBackCommand {
  type: 'browser_navigate_back';
}

export interface BrowserClickCommand {
  type: 'browser_click';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
}

export interface BrowserHoverCommand {
  type: 'browser_hover';
  ref: string;
  element: string;
}

export interface BrowserTypeCommand {
  type: 'browser_type';
  text: string;
}

export interface BrowserPressKeyCommand {
  type: 'browser_press_key';
  key: string;
}

export interface BrowserScrollCommand {
  type: 'browser_scroll';
  deltaX: number;
  deltaY: number;
}

export interface BrowserSelectOptionCommand {
  type: 'browser_select_option';
  ref: string;
  element: string;
  values: string[];
}

export interface BrowserDragCommand {
  type: 'browser_drag';
  startRef: string;
  startElement: string;
  endRef: string;
  endElement: string;
}

export interface BrowserFillFormCommand {
  type: 'browser_fill_form';
  fields: Array<{
    ref: string;
    name: string;
    type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';
    value: string;
  }>;
}

export interface BrowserSnapshotCommand {
  type: 'browser_snapshot';
}

export interface BrowserScreenshotCommand {
  type: 'browser_screenshot';
  fullPage?: boolean;
}

export interface BrowserConsoleMessagesCommand {
  type: 'browser_console_messages';
  level?: 'error' | 'warning' | 'info' | 'debug';
}

export interface BrowserNetworkRequestsCommand {
  type: 'browser_network_requests';
  includeStatic?: boolean;
}

export interface BrowserEvaluateCommand {
  type: 'browser_evaluate';
  function: string;
  ref?: string;
  element?: string;
}

export interface BrowserWaitForCommand {
  type: 'browser_wait_for';
  text?: string;
  textGone?: string;
  time?: number;
}

export interface BrowserHandleDialogCommand {
  type: 'browser_handle_dialog';
  accept: boolean;
  promptText?: string;
}

export interface BrowserResizeCommand {
  type: 'browser_resize';
  width: number;
  height: number;
}

export interface BrowserTabsCommand {
  type: 'browser_tabs';
  action: 'list' | 'new' | 'close' | 'select';
  index?: number;
}

export interface StartScreencastCommand {
  type: 'start_screencast';
  options?: ScreencastOptions;
}

export interface StopScreencastCommand {
  type: 'stop_screencast';
}

export interface ScreencastOptions {
  format?: 'jpeg' | 'png';
  quality?: number; // 1-100
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}

/**
 * Messages sent from container bridge to host server
 */
export type BridgeMessage =
  | BrowserLaunchedMessage
  | BrowserClosedMessage
  | CommandResultMessage
  | ScreencastFrameMessage
  | ScreencastStatusMessage
  | ErrorMessage;

export interface BrowserLaunchedMessage {
  type: 'browser_launched';
}

export interface BrowserClosedMessage {
  type: 'browser_closed';
}

export interface CommandResultMessage {
  type: 'command_result';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface ScreencastFrameMessage {
  type: 'screencast_frame';
  data: string; // Base64 encoded image
  metadata: {
    deviceWidth: number;
    deviceHeight: number;
    timestamp: number;
  };
}

export interface ScreencastStatusMessage {
  type: 'screencast_status';
  active: boolean;
  url?: string;
  title?: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

/**
 * Request wrapper with ID for matching responses
 */
export interface BridgeRequest {
  requestId: string;
  command: BridgeCommand;
}
