import type { KnownBlock, SectionBlock, ContextBlock } from '@slack/types';

// Slack has a limit of 3000 characters for text in blocks
const SLACK_TEXT_LIMIT = 2900;

/**
 * Truncate text to a maximum length, adding a suffix if truncated.
 */
export function truncateText(
  text: string,
  maxLength: number = SLACK_TEXT_LIMIT,
  suffix: string = '... (truncated)'
): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Escape special Slack markdown characters.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~');
}

/**
 * Convert standard Markdown to Slack's mrkdwn format.
 */
export function convertToSlackMarkdown(text: string): string {
  // Preserve code blocks first
  const codeBlocks: string[] = [];
  let result = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Preserve inline code
  const inlineCode: string[] = [];
  result = result.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `__INLINE_CODE_${inlineCode.length - 1}__`;
  });

  // First, convert italic: *text* -> _text_ (single asterisks only)
  // Must be done before bold conversion to avoid conflicts
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '_$1_');

  // Then convert bold: **text** -> *text*
  result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*');

  // Convert strikethrough: ~~text~~ -> ~text~
  result = result.replace(/~~([^~]+)~~/g, '~$1~');

  // Convert links: [text](url) -> <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    result = result.replace(`__CODE_BLOCK_${i}__`, block);
  });

  // Restore inline code
  inlineCode.forEach((code, i) => {
    result = result.replace(`__INLINE_CODE_${i}__`, code);
  });

  return result;
}

/**
 * Format text output from Claude as Slack blocks.
 */
export function formatTextOutput(text: string): KnownBlock[] {
  if (!text || !text.trim()) {
    return [];
  }

  const formatted = convertToSlackMarkdown(text);
  const truncated = truncateText(formatted);

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncated,
      },
    } as SectionBlock,
  ];
}

/**
 * Check if tool name is a browser tool (MCP bridge or direct).
 */
function isBrowserToolName(toolName: string): boolean {
  // MCP bridge browser tools: mcp__bridge__browser_*
  // Direct browser tools: browser_*
  // External Playwright MCP tools: mcp__plugin_playwright_playwright__browser_*
  return (
    toolName.startsWith('mcp__bridge__browser_') ||
    toolName.startsWith('browser_') ||
    toolName.startsWith('mcp__plugin_playwright_playwright__browser_')
  );
}

/**
 * Get the action part of a browser tool name.
 * e.g., "mcp__bridge__browser_navigate" -> "navigate"
 */
function getBrowserToolAction(toolName: string): string {
  if (toolName.startsWith('mcp__bridge__browser_')) {
    return toolName.replace('mcp__bridge__browser_', '');
  }
  if (toolName.startsWith('browser_')) {
    return toolName.replace('browser_', '');
  }
  if (toolName.startsWith('mcp__plugin_playwright_playwright__browser_')) {
    return toolName.replace('mcp__plugin_playwright_playwright__browser_', '');
  }
  return toolName;
}

/**
 * Format browser tool usage with friendly display.
 */
function formatBrowserToolInput(toolName: string, input: unknown): { header: string; detail?: string } {
  const action = getBrowserToolAction(toolName);
  const inp = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};

  switch (action) {
    case 'navigate': {
      const url = inp.url as string | undefined;
      if (url) {
        try {
          const urlObj = new URL(url);
          return { header: `:globe_with_meridians: Navigate: \`${urlObj.hostname}${urlObj.pathname}\`` };
        } catch {
          return { header: `:globe_with_meridians: Navigate: \`${truncateText(url, 50)}\`` };
        }
      }
      return { header: ':globe_with_meridians: Navigate' };
    }

    case 'click': {
      const element = inp.element as string | undefined;
      const ref = inp.ref as string | undefined;
      if (element) {
        return { header: `:computer_mouse: Click: "${truncateText(element, 40)}"` };
      }
      if (ref) {
        return { header: `:computer_mouse: Click: \`${ref}\`` };
      }
      return { header: ':computer_mouse: Click' };
    }

    case 'type': {
      const text = inp.text as string | undefined;
      const element = inp.element as string | undefined;
      if (text && element) {
        return { header: `:keyboard: Type in "${truncateText(element, 30)}": "${truncateText(text, 30)}"` };
      }
      if (text) {
        return { header: `:keyboard: Type: "${truncateText(text, 50)}"` };
      }
      return { header: ':keyboard: Type' };
    }

    case 'snapshot': {
      return { header: ':camera: Browser snapshot' };
    }

    case 'take_screenshot': {
      const filename = inp.filename as string | undefined;
      if (filename) {
        return { header: `:frame_with_picture: Screenshot: \`${filename}\`` };
      }
      return { header: ':frame_with_picture: Screenshot' };
    }

    case 'hover': {
      const element = inp.element as string | undefined;
      if (element) {
        return { header: `:point_up_2: Hover: "${truncateText(element, 40)}"` };
      }
      return { header: ':point_up_2: Hover' };
    }

    case 'scroll': {
      const direction = inp.direction as string | undefined;
      if (direction) {
        return { header: `:scroll: Scroll ${direction}` };
      }
      return { header: ':scroll: Scroll' };
    }

    case 'fill_form': {
      const fields = inp.fields as Array<{ name: string }> | undefined;
      if (fields && Array.isArray(fields)) {
        return { header: `:pencil: Fill form (${fields.length} fields)` };
      }
      return { header: ':pencil: Fill form' };
    }

    case 'select_option': {
      const element = inp.element as string | undefined;
      const values = inp.values as string[] | undefined;
      if (element && values) {
        return { header: `:ballot_box_with_check: Select: "${values.join(', ')}" in "${truncateText(element, 30)}"` };
      }
      return { header: ':ballot_box_with_check: Select option' };
    }

    case 'press_key': {
      const key = inp.key as string | undefined;
      if (key) {
        return { header: `:keyboard: Press key: \`${key}\`` };
      }
      return { header: ':keyboard: Press key' };
    }

    case 'wait_for': {
      const text = inp.text as string | undefined;
      const time = inp.time as number | undefined;
      if (text) {
        return { header: `:hourglass_flowing_sand: Wait for text: "${truncateText(text, 40)}"` };
      }
      if (time) {
        return { header: `:hourglass_flowing_sand: Wait ${time}s` };
      }
      return { header: ':hourglass_flowing_sand: Wait' };
    }

    case 'close': {
      return { header: ':x: Close browser' };
    }

    case 'resize': {
      const width = inp.width as number | undefined;
      const height = inp.height as number | undefined;
      if (width && height) {
        return { header: `:arrows_counterclockwise: Resize: ${width}x${height}` };
      }
      return { header: ':arrows_counterclockwise: Resize browser' };
    }

    case 'navigate_back': {
      return { header: ':arrow_left: Navigate back' };
    }

    case 'evaluate': {
      return { header: ':desktop_computer: Evaluate JavaScript' };
    }

    case 'tabs': {
      const tabAction = inp.action as string | undefined;
      if (tabAction) {
        return { header: `:card_index_dividers: Tabs: ${tabAction}` };
      }
      return { header: ':card_index_dividers: Browser tabs' };
    }

    default:
      // Unknown browser action, show action name
      return { header: `:globe_with_meridians: Browser: ${action}` };
  }
}

/**
 * Format tool usage as Slack blocks.
 */
export function formatToolUse(
  toolName: string,
  toolUseId: string,
  input: unknown
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Check if it's a browser tool
  if (isBrowserToolName(toolName)) {
    const { header, detail } = formatBrowserToolInput(toolName, input);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: header,
      },
    } as SectionBlock);

    if (detail) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: detail,
          },
        ],
      } as ContextBlock);
    }

    return blocks;
  }

  // Header with tool name
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `:wrench: *${toolName}*`,
    },
  } as SectionBlock);

  // Format input based on tool type
  let inputText = '';
  switch (toolName) {
    case 'Bash':
      if (typeof input === 'object' && input !== null && 'command' in input) {
        inputText = `\`\`\`\n${truncateText((input as any).command, 1000)}\n\`\`\``;
      }
      break;

    case 'Read':
      if (typeof input === 'object' && input !== null && 'file_path' in input) {
        inputText = `Reading: \`${(input as any).file_path}\``;
        if ((input as any).offset || (input as any).limit) {
          inputText += ` (offset: ${(input as any).offset || 0}, limit: ${(input as any).limit || 'all'})`;
        }
      }
      break;

    case 'Write':
    case 'Edit':
      if (typeof input === 'object' && input !== null && 'file_path' in input) {
        inputText = `File: \`${(input as any).file_path}\``;
        if ((input as any).content) {
          const content = truncateText((input as any).content, 500);
          inputText += `\n\`\`\`\n${content}\n\`\`\``;
        }
      }
      break;

    case 'Glob':
      if (typeof input === 'object' && input !== null && 'pattern' in input) {
        inputText = `Pattern: \`${(input as any).pattern}\``;
        if ((input as any).path) {
          inputText += ` in \`${(input as any).path}\``;
        }
      }
      break;

    case 'Grep':
      if (typeof input === 'object' && input !== null && 'pattern' in input) {
        inputText = `Pattern: \`${(input as any).pattern}\``;
        if ((input as any).path) {
          inputText += ` in \`${(input as any).path}\``;
        }
      }
      break;

    default:
      // Generic JSON display for unknown tools
      try {
        inputText = `\`\`\`json\n${truncateText(JSON.stringify(input, null, 2), 800)}\n\`\`\``;
      } catch {
        inputText = '_Input could not be displayed_';
      }
  }

  if (inputText) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: inputText,
        },
      ],
    } as ContextBlock);
  }

  return blocks;
}

/**
 * Check if content is a browser accessibility snapshot.
 * Exported for use in index.ts to handle snapshot uploads.
 *
 * Detects two formats:
 * 1. Old format with [ref=...] patterns
 * 2. New Playwright MCP format with accessibility tree (- link, - button, etc.)
 */
export function isBrowserSnapshot(text: string): { isSnapshot: boolean; elementCount: number } {
  // Check for old format with [ref=...] patterns
  const refMatches = text.match(/\[ref=/g);
  if (text.length > 1000 && refMatches && refMatches.length > 3) {
    return { isSnapshot: true, elementCount: refMatches.length };
  }

  // Check for new Playwright MCP format with accessibility tree
  // Look for patterns like: "- link", "- button", "- combobox", "- navigation:", etc.
  const accessibilityPatterns = text.match(/^\s*- (?:link|button|img|combobox|navigation|search|contentinfo|text|heading)/gm);
  if (text.length > 500 && accessibilityPatterns && accessibilityPatterns.length > 5) {
    return { isSnapshot: true, elementCount: accessibilityPatterns.length };
  }

  return { isSnapshot: false, elementCount: 0 };
}

/**
 * Extract text from tool result content (for checking if it's a snapshot).
 * Exported for use in index.ts.
 */
export function extractToolResultText(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.type === 'text' && typeof item.text === 'string') {
          return item.text;
        }
      }
    }
  } catch {
    // Not JSON, return as-is
  }
  return content;
}

/**
 * Result status for tool use display.
 */
export type ToolResultStatus =
  | { type: 'pending' }
  | { type: 'success'; summary?: string; permalink?: string }
  | { type: 'error'; message?: string }
  | { type: 'skipped' };

/**
 * Format tool use with optional result status.
 * When result is provided, the tool use display is updated to include result info.
 * For long results, provide a permalink to the uploaded file.
 */
export function formatToolUseWithResult(
  toolName: string,
  toolUseId: string,
  input: unknown,
  result?: ToolResultStatus
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Check if it's a browser tool
  if (isBrowserToolName(toolName)) {
    const { header, detail } = formatBrowserToolInput(toolName, input);

    // Build header with result status
    let headerWithResult = header;
    if (result) {
      switch (result.type) {
        case 'success':
          if (result.permalink) {
            headerWithResult = `${header}  :white_check_mark: <${result.permalink}|${result.summary || 'View result'}>`;
          } else if (result.summary) {
            headerWithResult = `${header}  :white_check_mark: ${result.summary}`;
          } else {
            headerWithResult = `${header}  :white_check_mark:`;
          }
          break;
        case 'error':
          headerWithResult = `${header}  :x: ${result.message || 'Error'}`;
          break;
        case 'skipped':
          // Just show the tool use without any indicator
          break;
      }
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: headerWithResult,
      },
    } as SectionBlock);

    if (detail) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: detail,
          },
        ],
      } as ContextBlock);
    }

    return blocks;
  }

  // Non-browser tool: show tool name with result status
  let headerText = `:wrench: *${toolName}*`;
  if (result) {
    switch (result.type) {
      case 'success':
        if (result.permalink) {
          headerText = `:wrench: *${toolName}*  :white_check_mark: <${result.permalink}|${result.summary || 'View result'}>`;
        } else if (result.summary) {
          headerText = `:wrench: *${toolName}*  :white_check_mark: ${result.summary}`;
        } else {
          headerText = `:wrench: *${toolName}*  :white_check_mark:`;
        }
        break;
      case 'error':
        headerText = `:wrench: *${toolName}*  :x: ${result.message || 'Error'}`;
        break;
      case 'skipped':
        // Just show the tool use
        break;
    }
  }

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: headerText,
    },
  } as SectionBlock);

  // Format input based on tool type
  let inputText = '';
  switch (toolName) {
    case 'Bash':
      if (typeof input === 'object' && input !== null && 'command' in input) {
        inputText = `\`\`\`\n${truncateText((input as any).command, 1000)}\n\`\`\``;
      }
      break;

    case 'Read':
      if (typeof input === 'object' && input !== null && 'file_path' in input) {
        inputText = `Reading: \`${(input as any).file_path}\``;
        if ((input as any).offset || (input as any).limit) {
          inputText += ` (offset: ${(input as any).offset || 0}, limit: ${(input as any).limit || 'all'})`;
        }
      }
      break;

    case 'Write':
    case 'Edit':
      if (typeof input === 'object' && input !== null && 'file_path' in input) {
        inputText = `File: \`${(input as any).file_path}\``;
        if ((input as any).content) {
          const content = truncateText((input as any).content, 500);
          inputText += `\n\`\`\`\n${content}\n\`\`\``;
        }
      }
      break;

    case 'Glob':
      if (typeof input === 'object' && input !== null && 'pattern' in input) {
        inputText = `Pattern: \`${(input as any).pattern}\``;
        if ((input as any).path) {
          inputText += ` in \`${(input as any).path}\``;
        }
      }
      break;

    case 'Grep':
      if (typeof input === 'object' && input !== null && 'pattern' in input) {
        inputText = `Pattern: \`${(input as any).pattern}\``;
        if ((input as any).path) {
          inputText += ` in \`${(input as any).path}\``;
        }
      }
      break;

    default:
      // Generic JSON display for unknown tools
      try {
        inputText = `\`\`\`json\n${truncateText(JSON.stringify(input, null, 2), 800)}\n\`\`\``;
      } catch {
        inputText = '_Input could not be displayed_';
      }
  }

  if (inputText) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: inputText,
        },
      ],
    } as ContextBlock);
  }

  return blocks;
}

/**
 * Format tool result as Slack blocks.
 */
export function formatToolResult(
  toolUseId: string,
  content: string,
  isError: boolean
): KnownBlock[] {
  const blocks: KnownBlock[] = [];
  const emoji = isError ? ':x:' : ':white_check_mark:';
  const label = isError ? 'Error' : 'Result';

  // Extract actual text from JSON array format
  const text = extractToolResultText(content);

  // Check for browser snapshot
  const snapshot = isBrowserSnapshot(text);
  if (snapshot.isSnapshot) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${emoji} *${label}:* :camera: Browser snapshot (${snapshot.elementCount} elements)`,
        },
      ],
    } as ContextBlock);
    return blocks;
  }

  // For very long results, show summary
  if (text.length > 2000) {
    const preview = truncateText(text, 500);
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${emoji} *${label}:* _(${text.length} chars, truncated)_`,
        },
      ],
    } as ContextBlock);
    if (preview) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `\`\`\`\n${preview}\n\`\`\``,
          },
        ],
      } as ContextBlock);
    }
    return blocks;
  }

  // Normal result
  const truncated = truncateText(text, 1500);
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `${emoji} *${label}:*`,
      },
    ],
  } as ContextBlock);

  if (truncated) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `\`\`\`\n${truncated}\n\`\`\``,
        },
      ],
    } as ContextBlock);
  }

  return blocks;
}

/**
 * Format thinking output as Slack blocks (collapsed/subtle display).
 */
export function formatThinking(thinking: string): KnownBlock[] {
  if (!thinking || !thinking.trim()) {
    return [];
  }

  const truncated = truncateText(thinking, 500);

  return [
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:thought_balloon: _${truncated}_`,
        },
      ],
    } as ContextBlock,
  ];
}

/**
 * Format error message as Slack blocks.
 */
export function formatError(message: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:x: *Error:* ${truncateText(message)}`,
      },
    } as SectionBlock,
  ];
}

/**
 * Format final result as Slack blocks.
 */
export function formatResult(result: string): KnownBlock[] {
  if (!result || !result.trim()) {
    return [];
  }

  const formatted = convertToSlackMarkdown(result);
  const truncated = truncateText(formatted);

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncated,
      },
    } as SectionBlock,
  ];
}

/**
 * Combine multiple block arrays, respecting Slack's 50 block limit.
 */
export function combineBlocks(...blockArrays: KnownBlock[][]): KnownBlock[] {
  const combined: KnownBlock[] = [];
  const MAX_BLOCKS = 50;

  for (const blocks of blockArrays) {
    for (const block of blocks) {
      if (combined.length >= MAX_BLOCKS) {
        // Add truncation notice
        combined.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '_... additional content truncated_',
            },
          ],
        } as ContextBlock);
        return combined;
      }
      combined.push(block);
    }
  }

  return combined;
}
