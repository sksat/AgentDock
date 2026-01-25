/**
 * Permission pattern matching for Claude Code compatible tool permissions.
 *
 * Pattern format: "ToolName" or "ToolName(pattern)"
 *
 * Wildcards:
 * - `:*` - Prefix matching with word boundary (e.g., "git:*" matches "git status" but not "gitk")
 * - `*` - Glob matching (e.g., "git*" matches both "git status" and "gitk")
 * - `**` - Recursive directory matching for file paths
 */

export interface PermissionPattern {
  toolName: string;
  pattern?: string;
}

/**
 * Parse a permission pattern string into a PermissionPattern object.
 *
 * Examples:
 * - "Bash" -> { toolName: "Bash" }
 * - "Bash(git:*)" -> { toolName: "Bash", pattern: "git:*" }
 * - "Write(./src/**)" -> { toolName: "Write", pattern: "./src/**" }
 */
export function parsePermissionPattern(patternStr: string): PermissionPattern {
  const match = patternStr.match(/^([^(]+)\((.*)?\)$/);
  if (match) {
    return {
      toolName: match[1],
      pattern: match[2] ?? '',
    };
  }
  return { toolName: patternStr };
}

/**
 * Check if a tool invocation matches any of the given permission patterns.
 */
export function matchesPermission(
  toolName: string,
  input: unknown,
  patterns: PermissionPattern[]
): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => matchesSinglePattern(toolName, input, pattern));
}

function matchesSinglePattern(
  toolName: string,
  input: unknown,
  pattern: PermissionPattern
): boolean {
  // Tool name must match
  if (pattern.toolName !== toolName) {
    return false;
  }

  // If no pattern specified, match all invocations of this tool
  if (pattern.pattern === undefined) {
    return true;
  }

  // Get the value to match against based on tool type
  const valueToMatch = getMatchValue(toolName, input);
  if (valueToMatch === null) {
    return false;
  }

  return matchPattern(pattern.pattern, valueToMatch);
}

/**
 * Get the value to match against from the tool input.
 */
function getMatchValue(toolName: string, input: unknown): string | null {
  if (input === null || input === undefined || typeof input !== 'object') {
    return null;
  }

  const inputObj = input as Record<string, unknown>;

  switch (toolName) {
    case 'Bash':
      return typeof inputObj.command === 'string' ? inputObj.command : null;
    case 'Read':
    case 'Write':
    case 'Edit':
      return typeof inputObj.file_path === 'string' ? inputObj.file_path : null;
    default:
      return null;
  }
}

/**
 * Match a value against a pattern.
 *
 * Pattern syntax:
 * - `:*` at end - prefix matching with word boundary
 * - `*` - glob matching (matches any characters)
 * - `**` - recursive directory matching
 */
function matchPattern(pattern: string, value: string): boolean {
  // Handle empty pattern - matches everything
  if (pattern === '') {
    return true;
  }

  // Handle prefix matching with :*
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -2);
    // Match if value equals prefix, or prefix followed by space
    return value === prefix || value.startsWith(prefix + ' ');
  }

  // Convert glob pattern to regex
  const regexPattern = globToRegex(pattern);
  return regexPattern.test(value);
}

/**
 * Convert a glob pattern to a regular expression.
 */
function globToRegex(pattern: string): RegExp {
  let regex = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches anything including path separators
        regex += '.*';
        i += 2;
      } else {
        // * matches anything except nothing (at least one char for glob behavior)
        // But for simpler matching, we'll match zero or more non-path-separator chars
        regex += '[^/]*';
        i++;
      }
    } else if (char === '?') {
      regex += '.';
      i++;
    } else if ('.+^${}|[]\\()'.includes(char)) {
      // Escape special regex characters
      regex += '\\' + char;
      i++;
    } else {
      regex += char;
      i++;
    }
  }

  return new RegExp('^' + regex);
}

/**
 * Suggest a permission pattern based on a tool invocation.
 *
 * Examples:
 * - Bash with { command: "git status" } -> "Bash(git:*)"
 * - Write with { file_path: "./src/app.ts" } -> "Write(./src/**)"
 */
export function suggestPattern(toolName: string, input: unknown): string {
  if (input === null || input === undefined || typeof input !== 'object') {
    return toolName;
  }

  const inputObj = input as Record<string, unknown>;

  switch (toolName) {
    case 'Bash': {
      const command = inputObj.command;
      if (typeof command !== 'string' || command === '') {
        return toolName;
      }
      // Extract first word (command name)
      const firstWord = command.split(' ')[0];
      return `Bash(${firstWord}:*)`;
    }

    case 'Read':
    case 'Write':
    case 'Edit': {
      const filePath = inputObj.file_path;
      if (typeof filePath !== 'string' || filePath === '') {
        return toolName;
      }
      // Extract directory
      const lastSlash = filePath.lastIndexOf('/');
      const dir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '.';
      return `${toolName}(${dir}/**)`;
    }

    default:
      return toolName;
  }
}
