import type { SystemPromptVariables } from '@agent-dock/shared';

/**
 * Expand template variables in a system prompt template.
 * Supports {{variable_name}} syntax.
 *
 * @param template The template string with {{variable}} placeholders
 * @param variables The variables to substitute
 * @returns The expanded template string
 */
export function expandSystemPromptTemplate(
  template: string,
  variables: SystemPromptVariables
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = variables[varName as keyof SystemPromptVariables];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Build system prompt variables from session context.
 *
 * @param options Session context options
 * @returns SystemPromptVariables object
 */
export function buildSystemPromptVariables(options: {
  sessionId: string;
  workingDir: string;
  baseUrl: string;
  repositoryName?: string;
  repositoryPath?: string;
}): SystemPromptVariables {
  // Remove trailing slash from baseUrl if present
  const normalizedBaseUrl = options.baseUrl.replace(/\/$/, '');

  return {
    session_id: options.sessionId,
    session_url: `${normalizedBaseUrl}/session/${options.sessionId}`,
    working_dir: options.workingDir,
    repository_name: options.repositoryName,
    repository_path: options.repositoryPath,
  };
}
