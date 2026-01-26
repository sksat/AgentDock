/**
 * StreamRecorder - Records raw stream data from Claude Code CLI for debugging.
 *
 * Key features:
 * - Records raw stream chunks without splitting by newlines
 * - Captures timestamps for each chunk
 * - Records both stdout/stderr and stdin events
 * - Exports to JSON for replay and analysis
 */

export interface StreamChunk {
  /** Absolute timestamp in milliseconds */
  timestamp: number;
  /** Time relative to recording start in milliseconds */
  relativeTime: number;
  /** Base64 encoded raw data */
  data: string;
  /** Source of the data */
  source: 'stdout' | 'stderr';
}

export interface StdinEvent {
  /** Absolute timestamp in milliseconds */
  timestamp: number;
  /** Time relative to recording start in milliseconds */
  relativeTime: number;
  /** The data sent to stdin (as string) */
  data: string;
}

export interface StreamRecording {
  /** Timestamp when recording started */
  startTime: number;
  /** Recorded output chunks */
  chunks: StreamChunk[];
  /** Recorded stdin events */
  stdinEvents: StdinEvent[];
}

export class StreamRecorder {
  private recording = false;
  private startTime = 0;
  private chunks: StreamChunk[] = [];
  private stdinEvents: StdinEvent[] = [];

  /**
   * Start recording stream data.
   * Clears any previous recording data.
   */
  startRecording(): void {
    this.recording = true;
    this.startTime = Date.now();
    this.chunks = [];
    this.stdinEvents = [];
  }

  /**
   * Stop recording and return the recorded data.
   */
  stopRecording(): StreamRecording {
    this.recording = false;
    return {
      startTime: this.startTime,
      chunks: [...this.chunks],
      stdinEvents: [...this.stdinEvents],
    };
  }

  /**
   * Record a chunk of data from stdout or stderr.
   * The data is stored as base64 to preserve binary content.
   * Does NOT split by newlines - records exactly what was received.
   */
  recordChunk(data: Buffer, source: 'stdout' | 'stderr'): void {
    if (!this.recording) return;

    const timestamp = Date.now();
    this.chunks.push({
      timestamp,
      relativeTime: timestamp - this.startTime,
      data: data.toString('base64'),
      source,
    });
  }

  /**
   * Record data sent to stdin.
   */
  recordStdin(data: string): void {
    if (!this.recording) return;

    const timestamp = Date.now();
    this.stdinEvents.push({
      timestamp,
      relativeTime: timestamp - this.startTime,
      data,
    });
  }

  /**
   * Export the current recording as JSON string.
   * Can be used even while still recording.
   */
  exportForReplay(): string {
    return JSON.stringify(
      {
        startTime: this.startTime,
        chunks: this.chunks,
        stdinEvents: this.stdinEvents,
      },
      null,
      2
    );
  }
}
