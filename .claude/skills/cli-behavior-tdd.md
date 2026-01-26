---
name: cli-behavior-tdd
description: |
  TDD development style for Claude Code CLI integration.
  Record real CLI stream behavior, reproduce in mock,
  then use mock for testing. Use when: implementing features
  that depend on CLI behavior, debugging stream issues,
  or ensuring accurate mock scenarios.
---

# CLI Behavior TDD

TDD development style for features that interact with Claude Code CLI.
The key principle: **never guess CLI behavior - always verify first**.

## Workflow

### Phase 1: Record Real Behavior

Use the StreamRecorder debug library to capture actual CLI behavior.

```bash
# Record a specific scenario
npx tsx packages/server/scripts/debug-claude-stream.ts \
  --output recordings/<scenario-name>.json \
  --prompt "Your test prompt here"

# Interactive mode for permission/question flows
npx tsx packages/server/scripts/debug-claude-stream.ts \
  --output recordings/<scenario-name>.json \
  --prompt "Prompt that triggers interaction" \
  --interactive
```

**Key principles for recording:**
- Do NOT split stream by newlines - record raw chunks with timestamps
- Record stdin events (what we send) alongside stdout/stderr
- Capture timing information for realistic replay

### Phase 2: Analyze Recording

Examine the recording to understand the actual behavior:

```bash
# View the recording
cat recordings/<scenario-name>.json | jq '.'

# Decode base64 chunks to see content
cat recordings/<scenario-name>.json | jq -r '.chunks[].data' | base64 -d
```

**What to look for:**
- Event sequence (system → thinking → tool_use → result)
- When vibing should start/stop
- How permission/question flows work
- Chunk boundaries and timing

### Phase 3: Update Mock

Ensure MockClaudeRunner can reproduce the recorded behavior.

**File:** `packages/server/src/mock-claude-runner.ts`

1. Add new scenario type if needed
2. Add factory method for common patterns:
   ```typescript
   static withNewScenario(): MockClaudeRunner {
     const runner = new MockClaudeRunner();
     runner.setScenario({
       name: 'new-scenario',
       steps: [
         // Based on recording analysis
       ],
     });
     return runner;
   }
   ```

### Phase 4: Write Tests First (TDD)

**File:** `packages/server/src/__tests__/<feature>.test.ts`

```typescript
describe('Feature behavior', () => {
  it('should handle scenario correctly', async () => {
    const runner = MockClaudeRunner.withNewScenario();

    // Set up event handlers
    const handler = vi.fn();
    runner.on('event', handler);

    // Start and verify
    runner.start('test input');

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith(/* expected */);
    });
  });
});
```

### Phase 5: Implement

Now implement the feature to make tests pass.

## Debug Tools

### StreamRecorder

**Location:** `packages/server/src/debug/stream-recorder.ts`

```typescript
import { StreamRecorder } from '../debug/stream-recorder.js';

const recorder = new StreamRecorder();
recorder.startRecording();

// Record chunks as they arrive (don't split!)
process.stdout.on('data', (data: Buffer) => {
  recorder.recordChunk(data, 'stdout');
});

// Record stdin
recorder.recordStdin(inputJson);

// Export
const json = recorder.exportForReplay();
```

### Debug Script

**Location:** `packages/server/scripts/debug-claude-stream.ts`

Options:
- `--output, -o`: Output file path (required)
- `--prompt, -p`: Initial prompt (required)
- `--claude-path`: Path to claude CLI (default: claude)
- `--cwd`: Working directory
- `--interactive, -i`: Enable interactive mode

Interactive commands:
- `.quit`, `.q`: Stop and save
- `.status`: Show recording status
- `.help`: Show help
- Send JSON directly for stdin

## Common Scenarios to Verify

### Simple Response
```bash
npx tsx packages/server/scripts/debug-claude-stream.ts -o recordings/simple.json \
  -p "Reply with just 'hello'"
```

### Permission Request
```bash
npx tsx packages/server/scripts/debug-claude-stream.ts -o recordings/permission.json \
  -p "Write 'test' to /tmp/test.txt" --interactive
```

### AskUserQuestion
```bash
npx tsx packages/server/scripts/debug-claude-stream.ts -o recordings/question.json \
  -p "Ask me which color I prefer" --interactive
```

### Thinking + Tool Use
```bash
npx tsx packages/server/scripts/debug-claude-stream.ts -o recordings/thinking-tool.json \
  -p "Read the file package.json and tell me the name"
```

## Important Notes

1. **Raw stream data**: Always record raw chunks without splitting by newlines
2. **Timestamps matter**: Record relative times for realistic replay
3. **Keep recordings**: Store recordings in `packages/server/recordings/` for future reference
4. **Update mocks**: When CLI behavior changes, re-record and update mocks
5. **Integration tests**: Use mocks for fast, deterministic tests

## Related Files

- `packages/server/src/debug/stream-recorder.ts`: Recording library
- `packages/server/scripts/debug-claude-stream.ts`: Debug script
- `packages/server/src/mock-claude-runner.ts`: Mock implementation
- `packages/server/recordings/`: Saved recordings (gitignored)
