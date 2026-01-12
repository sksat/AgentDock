import type { Scenario } from './mock-claude-runner.js';

/**
 * Scenarios for E2E testing various UI features
 */

/** Scenario that includes thinking blocks */
export const thinkingScenario: Scenario = {
  name: 'thinking',
  promptPattern: /think|analyze|consider/i,
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Write', 'Edit', 'Bash'],
    },
    { type: 'thinking', thinking: 'Let me analyze this problem step by step...' },
    { type: 'thinking', thinking: 'First, I need to understand the requirements.' },
    { type: 'text', text: 'After careful analysis, here is my response.' },
    {
      type: 'usage',
      inputTokens: 1500,
      outputTokens: 500,
      cacheReadInputTokens: 100,
    },
    { type: 'result', result: 'Analysis complete' },
  ],
};

/** Scenario that simulates tool usage (file read) */
export const toolUseScenario: Scenario = {
  name: 'tool-use',
  promptPattern: /read|file|show/i,
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Write', 'Edit', 'Bash'],
    },
    { type: 'thinking', thinking: 'I need to read the file to answer this question.' },
    {
      type: 'tool_use',
      id: 'read-1',
      name: 'Read',
      input: { file_path: '/src/app.ts' },
    },
    {
      type: 'tool_result',
      toolUseId: 'read-1',
      content: 'export function main() {\n  console.log("Hello, World!");\n}',
      isError: false,
    },
    { type: 'text', text: 'I found the file content. Here is what it contains.' },
    {
      type: 'usage',
      inputTokens: 2000,
      outputTokens: 300,
    },
    { type: 'result', result: 'File read complete' },
  ],
};

/** Scenario that asks user a question */
export const askQuestionScenario: Scenario = {
  name: 'ask-question',
  promptPattern: /help|implement|create|build/i,
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Write', 'Edit', 'Bash', 'AskUserQuestion'],
    },
    { type: 'thinking', thinking: 'I need to clarify the requirements before proceeding.' },
    {
      type: 'tool_use',
      id: 'ask-1',
      name: 'AskUserQuestion',
      input: {
        questions: [
          {
            question: 'Which framework would you like to use?',
            header: 'Framework',
            options: [
              { label: 'React', description: 'A JavaScript library for building UIs' },
              { label: 'Vue', description: 'A progressive JavaScript framework' },
              { label: 'Svelte', description: 'A compiler-based framework' },
            ],
            multiSelect: false,
          },
        ],
      },
    },
    { type: 'wait_for_input' },
    { type: 'text', text: 'Great choice! I will proceed with {input}.' },
    {
      type: 'usage',
      inputTokens: 1000,
      outputTokens: 200,
    },
    { type: 'result', result: 'Question answered' },
  ],
};

/** Scenario for testing multi-question UI */
export const multiQuestionScenario: Scenario = {
  name: 'multi-question',
  promptPattern: /setup|configure|options/i,
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
      tools: ['AskUserQuestion'],
    },
    {
      type: 'tool_use',
      id: 'ask-multi',
      name: 'AskUserQuestion',
      input: {
        questions: [
          {
            question: 'Which language do you prefer?',
            header: 'Language',
            options: [
              { label: 'TypeScript', description: 'JavaScript with types' },
              { label: 'JavaScript', description: 'Dynamic scripting language' },
            ],
            multiSelect: false,
          },
          {
            question: 'Which testing framework?',
            header: 'Testing',
            options: [
              { label: 'Vitest', description: 'Fast unit testing' },
              { label: 'Jest', description: 'Popular testing framework' },
              { label: 'Mocha', description: 'Flexible test framework' },
            ],
            multiSelect: false,
          },
        ],
      },
    },
    { type: 'wait_for_input' },
    { type: 'text', text: 'Configuration saved with your preferences.' },
    { type: 'result', result: 'Setup complete' },
  ],
};

/** Quick echo scenario for basic testing */
export const echoScenario: Scenario = {
  name: 'echo',
  promptPattern: /^echo\s/i,
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
    },
    { type: 'text', text: 'Echo: {input}' },
    { type: 'result', result: 'Echo done' },
  ],
};

/** All test scenarios */
export const testScenarios: Scenario[] = [
  thinkingScenario,
  toolUseScenario,
  askQuestionScenario,
  multiQuestionScenario,
  echoScenario,
];
