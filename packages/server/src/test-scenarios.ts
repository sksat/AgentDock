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

/** Slow thinking scenario for testing real-time streaming updates */
export const slowThinkingScenario: Scenario = {
  name: 'slow-thinking',
  promptPattern: /slow|stream|realtime|real-time/i,
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Write', 'Edit', 'Bash'],
    },
    { type: 'thinking', thinking: 'Hmm, let me think about this carefully...', delay: 500 },
    { type: 'thinking', thinking: '\n\nFirst, I need to break down the problem into smaller parts.', delay: 800 },
    { type: 'thinking', thinking: '\n\nLet me consider the different approaches:', delay: 600 },
    { type: 'thinking', thinking: '\n1. We could use a recursive solution', delay: 400 },
    { type: 'thinking', thinking: '\n2. Or perhaps an iterative approach would be better', delay: 400 },
    { type: 'thinking', thinking: '\n3. There might also be a mathematical formula', delay: 400 },
    { type: 'thinking', thinking: '\n\nAfter weighing the options, I think approach #2 is best because it will be more efficient and easier to understand.', delay: 1000 },
    { type: 'thinking', thinking: '\n\nNow let me formulate my response...', delay: 500 },
    { type: 'text', text: 'After careful consideration, I recommend using an iterative approach. ', delay: 300 },
    { type: 'text', text: 'This will give us O(n) time complexity ', delay: 200 },
    { type: 'text', text: 'while keeping the code readable and maintainable.', delay: 200 },
    {
      type: 'usage',
      inputTokens: 2500,
      outputTokens: 800,
      cacheReadInputTokens: 500,
    },
    { type: 'result', result: 'Slow thinking analysis complete' },
  ],
};

/** Very slow scenario with many small thinking chunks for streaming test */
export const streamingThinkingScenario: Scenario = {
  name: 'streaming-thinking',
  promptPattern: /streaming|chunks|incremental/i,
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
    },
    { type: 'thinking', thinking: 'Processing', delay: 100 },
    { type: 'thinking', thinking: '.', delay: 100 },
    { type: 'thinking', thinking: '.', delay: 100 },
    { type: 'thinking', thinking: '.', delay: 100 },
    { type: 'thinking', thinking: '\n\nAnalyzing input', delay: 200 },
    { type: 'thinking', thinking: '.', delay: 100 },
    { type: 'thinking', thinking: '.', delay: 100 },
    { type: 'thinking', thinking: '.', delay: 100 },
    { type: 'thinking', thinking: '\n\nGenerating response', delay: 200 },
    { type: 'thinking', thinking: '.', delay: 100 },
    { type: 'thinking', thinking: '.', delay: 100 },
    { type: 'thinking', thinking: '.', delay: 100 },
    { type: 'thinking', thinking: ' Done!', delay: 200 },
    { type: 'text', text: 'Here is my response after thinking through it step by step.', delay: 100 },
    {
      type: 'usage',
      inputTokens: 500,
      outputTokens: 100,
    },
    { type: 'result', result: 'Streaming test complete' },
  ],
};

/** Scenario that requires permission (write file) */
export const permissionScenario: Scenario = {
  name: 'permission',
  promptPattern: /write something|write file|create file/i,
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Write', 'Edit', 'Bash'],
      permissionMode: 'default',
    },
    { type: 'thinking', thinking: 'I need to write a file, which requires permission.' },
    {
      type: 'permission_request',
      toolName: 'Write',
      input: { file_path: '/tmp/test.txt', content: 'Hello, World!' },
    },
    { type: 'text', text: 'File written successfully.' },
    {
      type: 'usage',
      inputTokens: 500,
      outputTokens: 100,
    },
    { type: 'result', result: 'Write complete' },
  ],
};

/** Scenario for ExitPlanMode with permission request */
export const exitPlanModeScenario: Scenario = {
  name: 'exit-plan-mode',
  promptPattern: /plan|approve|exit\s*plan/i,
  steps: [
    {
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Write', 'Edit', 'Bash', 'EnterPlanMode', 'ExitPlanMode'],
      permissionMode: 'plan',
    },
    { type: 'thinking', thinking: 'I am in plan mode. Let me create a plan for this task.' },
    { type: 'text', text: 'Here is my implementation plan:\n\n## Plan\n1. Analyze the codebase\n2. Implement the feature\n3. Write tests\n4. Update documentation' },
    {
      type: 'permission_request',
      toolName: 'ExitPlanMode',
      input: {
        allowedPrompts: [
          { tool: 'Bash', prompt: 'run tests' },
        ],
      },
      resultOnAllow: 'Plan approved by user. Starting implementation.',
      resultOnDeny: 'Plan not approved. Please provide feedback.',
    },
    { type: 'text', text: 'Great! Your plan has been approved. I will now proceed with the implementation.' },
    {
      type: 'usage',
      inputTokens: 1500,
      outputTokens: 400,
    },
    { type: 'result', result: 'Plan approved and ready for implementation' },
  ],
};

/** All test scenarios */
export const testScenarios: Scenario[] = [
  thinkingScenario,
  toolUseScenario,
  askQuestionScenario,
  multiQuestionScenario,
  echoScenario,
  slowThinkingScenario,
  streamingThinkingScenario,
  permissionScenario,
  exitPlanModeScenario,
];
