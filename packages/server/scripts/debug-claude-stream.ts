#!/usr/bin/env npx tsx
/**
 * Debug script for recording Claude Code CLI stream behavior.
 *
 * Records raw stream data from stdout/stderr and stdin events with timestamps.
 * The recording can be used to understand Claude Code's stream behavior
 * and reproduce it in mock scenarios.
 *
 * Usage:
 *   npx tsx packages/server/scripts/debug-claude-stream.ts \
 *     --output recordings/test.json \
 *     --prompt "Your prompt here"
 *
 * Options:
 *   --output, -o   Output file path for the recording (required)
 *   --prompt, -p   Initial prompt to send to Claude Code (required)
 *   --claude-path  Path to claude CLI (default: claude)
 *   --cwd          Working directory for Claude Code
 *   --interactive  Enable interactive mode for stdin input
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { StreamRecorder } from '../src/debug/stream-recorder.js';

interface Options {
  output: string;
  prompt: string;
  claudePath: string;
  cwd?: string;
  interactive: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Partial<Options> = {
    claudePath: 'claude',
    interactive: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--output':
      case '-o':
        options.output = next;
        i++;
        break;
      case '--prompt':
      case '-p':
        options.prompt = next;
        i++;
        break;
      case '--claude-path':
        options.claudePath = next;
        i++;
        break;
      case '--cwd':
        options.cwd = next;
        i++;
        break;
      case '--interactive':
      case '-i':
        options.interactive = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  if (!options.output) {
    console.error('Error: --output is required');
    printHelp();
    process.exit(1);
  }

  if (!options.prompt) {
    console.error('Error: --prompt is required');
    printHelp();
    process.exit(1);
  }

  return options as Options;
}

function printHelp(): void {
  console.log(`
Debug script for recording Claude Code CLI stream behavior.

Usage:
  npx tsx packages/server/scripts/debug-claude-stream.ts [options]

Options:
  --output, -o      Output file path for the recording (required)
  --prompt, -p      Initial prompt to send to Claude Code (required)
  --claude-path     Path to claude CLI (default: claude)
  --cwd             Working directory for Claude Code
  --interactive, -i Enable interactive mode for stdin input
  --help, -h        Show this help message

Examples:
  # Record a simple prompt
  npx tsx packages/server/scripts/debug-claude-stream.ts \\
    -o recordings/simple.json \\
    -p "What is 2+2?"

  # Record with interactive mode (for permission responses)
  npx tsx packages/server/scripts/debug-claude-stream.ts \\
    -o recordings/permission.json \\
    -p "Write a file to /tmp/test.txt" \\
    --interactive

Interactive Mode Commands:
  When in interactive mode, you can type JSON messages to send to stdin.
  Special commands:
    .quit, .q     - Stop recording and save
    .status       - Show recording status
    .help         - Show interactive help
`);
}

function formatTimestamp(date: Date): string {
  return date.toISOString().slice(11, 23);
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Ensure output directory exists
  const outputDir = path.dirname(options.output);
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('=== Claude Code Stream Debugger ===');
  console.log(`Output: ${options.output}`);
  console.log(`Prompt: ${options.prompt}`);
  console.log(`Interactive: ${options.interactive}`);
  console.log('');

  const recorder = new StreamRecorder();
  recorder.startRecording();

  // Build Claude CLI arguments
  const args = [
    '-p',
    '', // Empty system prompt
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
  ];

  console.log(`Spawning: ${options.claudePath} ${args.join(' ')}`);
  console.log('');

  const claudeProcess = spawn(options.claudePath, args, {
    cwd: options.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Record stdout
  claudeProcess.stdout.on('data', (data: Buffer) => {
    const timestamp = formatTimestamp(new Date());
    console.log(`[${timestamp}] [STDOUT] ${data.length} bytes`);

    // Try to parse and pretty print JSON lines
    const str = data.toString('utf-8');
    for (const line of str.split('\n')) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          console.log(`  ${JSON.stringify(parsed, null, 2).split('\n').join('\n  ')}`);
        } catch {
          console.log(`  (raw) ${line}`);
        }
      }
    }

    recorder.recordChunk(data, 'stdout');
  });

  // Record stderr
  claudeProcess.stderr.on('data', (data: Buffer) => {
    const timestamp = formatTimestamp(new Date());
    console.log(`[${timestamp}] [STDERR] ${data.toString('utf-8')}`);
    recorder.recordChunk(data, 'stderr');
  });

  // Handle process exit
  claudeProcess.on('exit', (code, signal) => {
    console.log('');
    console.log(`Claude process exited with code ${code}, signal ${signal}`);
    saveAndExit();
  });

  claudeProcess.on('error', (err) => {
    console.error('Failed to start Claude:', err);
    saveAndExit();
  });

  // Send initial user message (format matches Claude Code CLI's stream-json input)
  const userMessage = {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: options.prompt }],
    },
  };

  const userMessageStr = JSON.stringify(userMessage) + '\n';
  console.log(`[${formatTimestamp(new Date())}] [STDIN] Sending initial message...`);
  console.log(`  ${JSON.stringify(userMessage, null, 2).split('\n').join('\n  ')}`);

  recorder.recordStdin(userMessageStr);
  claudeProcess.stdin.write(userMessageStr);

  // Interactive mode
  if (options.interactive) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('');
    console.log('Interactive mode enabled. Type JSON messages or commands.');
    console.log('Commands: .quit, .status, .help');
    console.log('');

    rl.on('line', (line) => {
      const trimmed = line.trim();

      if (trimmed === '.quit' || trimmed === '.q') {
        console.log('Stopping...');
        claudeProcess.stdin.end();
        return;
      }

      if (trimmed === '.status') {
        const recording = recorder.stopRecording();
        console.log(`Chunks: ${recording.chunks.length}`);
        console.log(`Stdin events: ${recording.stdinEvents.length}`);
        recorder.startRecording(); // Continue recording
        return;
      }

      if (trimmed === '.help') {
        console.log('Commands:');
        console.log('  .quit, .q  - Stop and save');
        console.log('  .status    - Show recording status');
        console.log('  .help      - Show this help');
        console.log('');
        console.log('Send JSON messages directly, e.g.:');
        console.log('  {"type":"permission_response","response":{"behavior":"allow"}}');
        return;
      }

      if (!trimmed) {
        return;
      }

      // Try to parse as JSON
      try {
        JSON.parse(trimmed);
        const stdinData = trimmed + '\n';
        console.log(`[${formatTimestamp(new Date())}] [STDIN] Sending...`);
        recorder.recordStdin(stdinData);
        claudeProcess.stdin.write(stdinData);
      } catch {
        console.log('Invalid JSON. Type .help for commands.');
      }
    });

    rl.on('close', () => {
      claudeProcess.stdin.end();
    });
  }

  function saveAndExit(): void {
    const recording = recorder.stopRecording();
    const json = recorder.exportForReplay();

    fs.writeFileSync(options.output, json, 'utf-8');
    console.log('');
    console.log('=== Recording Summary ===');
    console.log(`Chunks: ${recording.chunks.length}`);
    console.log(`Stdin events: ${recording.stdinEvents.length}`);
    console.log(`Saved to: ${options.output}`);

    process.exit(0);
  }

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\nInterrupted...');
    claudeProcess.kill('SIGTERM');
  });
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
