import type { KnownBlock, HeaderBlock, SectionBlock, ContextBlock, ActionsBlock, Button } from '@slack/types';
import { truncateText } from './message-formatter.js';

// Maximum length for formatted tool input
const MAX_INPUT_LENGTH = 1000;

/**
 * Format tool input for display in permission request.
 */
export function formatToolInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') {
    return '_No input_';
  }

  const inputObj = input as Record<string, unknown>;

  switch (toolName) {
    case 'Bash': {
      const command = inputObj.command;
      if (typeof command === 'string') {
        return `\`\`\`\n${truncateText(command, MAX_INPUT_LENGTH)}\n\`\`\``;
      }
      break;
    }

    case 'Read': {
      const filePath = inputObj.file_path;
      let text = `*File:* \`${filePath}\``;
      if (inputObj.offset || inputObj.limit) {
        text += `\n*Range:* offset=${inputObj.offset || 0}, limit=${inputObj.limit || 'all'}`;
      }
      return text;
    }

    case 'Write': {
      const filePath = inputObj.file_path;
      const content = inputObj.content;
      let text = `*File:* \`${filePath}\``;
      if (typeof content === 'string') {
        text += `\n*Content:*\n\`\`\`\n${truncateText(content, MAX_INPUT_LENGTH / 2)}\n\`\`\``;
      }
      return text;
    }

    case 'Edit': {
      const filePath = inputObj.file_path;
      let text = `*File:* \`${filePath}\``;
      if (inputObj.old_string && inputObj.new_string) {
        text += `\n*Old:* \`${truncateText(String(inputObj.old_string), 200)}\``;
        text += `\n*New:* \`${truncateText(String(inputObj.new_string), 200)}\``;
      }
      return text;
    }

    case 'Glob': {
      let text = `*Pattern:* \`${inputObj.pattern}\``;
      if (inputObj.path) {
        text += `\n*Path:* \`${inputObj.path}\``;
      }
      return text;
    }

    case 'Grep': {
      let text = `*Pattern:* \`${inputObj.pattern}\``;
      if (inputObj.path) {
        text += `\n*Path:* \`${inputObj.path}\``;
      }
      return text;
    }
  }

  // Default: JSON display
  try {
    const json = JSON.stringify(input, null, 2);
    return `\`\`\`json\n${truncateText(json, MAX_INPUT_LENGTH)}\n\`\`\``;
  } catch {
    return '_Input could not be displayed_';
  }
}

/**
 * Build Block Kit blocks for a permission request.
 */
export function buildPermissionRequestBlocks(
  requestId: string,
  toolName: string,
  input: unknown
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: ':warning: Permission Request',
      emoji: true,
    },
  } as HeaderBlock);

  // Tool name
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Tool:* \`${toolName}\``,
    },
  } as SectionBlock);

  // Tool input
  const formattedInput = formatToolInput(toolName, input);
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: formattedInput,
      },
    ],
  } as ContextBlock);

  // Action buttons
  const allowButton: Button = {
    type: 'button',
    text: {
      type: 'plain_text',
      text: 'Allow',
      emoji: true,
    },
    style: 'primary',
    action_id: `allow_${requestId}`,
    value: JSON.stringify({ requestId, action: 'allow' }),
  };

  const allowSessionButton: Button = {
    type: 'button',
    text: {
      type: 'plain_text',
      text: 'Allow for Session',
      emoji: true,
    },
    action_id: `allow_session_${requestId}`,
    value: JSON.stringify({ requestId, action: 'allow_session', toolName }),
  };

  const denyButton: Button = {
    type: 'button',
    text: {
      type: 'plain_text',
      text: 'Deny',
      emoji: true,
    },
    style: 'danger',
    action_id: `deny_${requestId}`,
    value: JSON.stringify({ requestId, action: 'deny' }),
  };

  blocks.push({
    type: 'actions',
    block_id: `permission_${requestId}`,
    elements: [allowButton, allowSessionButton, denyButton],
  } as ActionsBlock);

  return blocks;
}

/**
 * Build Block Kit blocks for a permission result (after user responds).
 */
export function buildPermissionResultBlocks(
  toolName: string,
  action: 'allowed' | 'denied',
  userId: string
): KnownBlock[] {
  const emoji = action === 'allowed' ? ':white_check_mark:' : ':x:';
  const text = action === 'allowed' ? 'Allowed' : 'Denied';

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} \`${toolName}\` - *${text}* by <@${userId}>`,
      },
    } as SectionBlock,
  ];
}

/**
 * Parsed permission action from Slack button click.
 */
export interface ParsedPermissionAction {
  requestId: string;
  action: 'allow' | 'allow_session' | 'deny';
  toolName?: string;
}

/**
 * Parse the action ID and value from a Slack button click.
 */
export function parsePermissionAction(
  actionId: string,
  value: string
): ParsedPermissionAction | null {
  try {
    const parsed = JSON.parse(value);

    if (!parsed.requestId || !parsed.action) {
      return null;
    }

    return {
      requestId: parsed.requestId,
      action: parsed.action,
      toolName: parsed.toolName,
    };
  } catch {
    return null;
  }
}

/**
 * Convert parsed action to permission response for AgentDock.
 */
export function actionToPermissionResponse(
  action: ParsedPermissionAction,
  input: unknown
): {
  behavior: 'allow' | 'deny';
  updatedInput?: unknown;
  message?: string;
  allowForSession?: boolean;
  toolName?: string;
} {
  switch (action.action) {
    case 'allow':
      return {
        behavior: 'allow',
        updatedInput: input,
      };

    case 'allow_session':
      return {
        behavior: 'allow',
        updatedInput: input,
        allowForSession: true,
        toolName: action.toolName,
      };

    case 'deny':
      return {
        behavior: 'deny',
        message: 'User denied permission via Slack',
      };

    default:
      return {
        behavior: 'deny',
        message: 'Unknown action',
      };
  }
}
