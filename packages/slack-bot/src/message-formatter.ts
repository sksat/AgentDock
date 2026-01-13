import type { KnownBlock, SectionBlock, ContextBlock } from '@slack/bolt';

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
 * Format tool usage as Slack blocks.
 */
export function formatToolUse(
  toolName: string,
  toolUseId: string,
  input: unknown
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

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
  const truncated = truncateText(content, 1500);

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
