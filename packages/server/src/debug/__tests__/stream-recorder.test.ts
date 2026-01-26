import { describe, it, expect, beforeEach } from 'vitest';
import { StreamRecorder } from '../stream-recorder.js';
import type { StreamRecording, StreamChunk, StdinEvent } from '../stream-recorder.js';

describe('StreamRecorder', () => {
  let recorder: StreamRecorder;

  beforeEach(() => {
    recorder = new StreamRecorder();
  });

  describe('basic recording', () => {
    it('should start and stop recording', () => {
      recorder.startRecording();
      const recording = recorder.stopRecording();

      expect(recording).toBeDefined();
      expect(recording.startTime).toBeGreaterThan(0);
      expect(recording.chunks).toEqual([]);
      expect(recording.stdinEvents).toEqual([]);
    });

    it('should record chunks with timestamps', () => {
      recorder.startRecording();
      const testData = Buffer.from('{"type":"system"}\n');
      recorder.recordChunk(testData, 'stdout');
      const recording = recorder.stopRecording();

      expect(recording.chunks).toHaveLength(1);
      expect(recording.chunks[0].timestamp).toBeGreaterThan(0);
      expect(recording.chunks[0].relativeTime).toBeGreaterThanOrEqual(0);
      expect(recording.chunks[0].source).toBe('stdout');
    });

    it('should preserve raw data without splitting by newlines', () => {
      recorder.startRecording();

      // Simulate a chunk that contains multiple JSON lines (as it might arrive from the stream)
      const multiLineData = Buffer.from('{"type":"system"}\n{"type":"assistant"}\n');
      recorder.recordChunk(multiLineData, 'stdout');

      const recording = recorder.stopRecording();

      // Should be recorded as a single chunk, not split
      expect(recording.chunks).toHaveLength(1);

      // Decode and verify the data is preserved exactly
      const decodedData = Buffer.from(recording.chunks[0].data, 'base64').toString('utf-8');
      expect(decodedData).toBe('{"type":"system"}\n{"type":"assistant"}\n');
    });

    it('should record multiple chunks separately', () => {
      recorder.startRecording();

      recorder.recordChunk(Buffer.from('chunk1'), 'stdout');
      recorder.recordChunk(Buffer.from('chunk2'), 'stdout');
      recorder.recordChunk(Buffer.from('error'), 'stderr');

      const recording = recorder.stopRecording();

      expect(recording.chunks).toHaveLength(3);
      expect(recording.chunks[0].source).toBe('stdout');
      expect(recording.chunks[1].source).toBe('stdout');
      expect(recording.chunks[2].source).toBe('stderr');
    });

    it('should calculate relative time correctly', async () => {
      recorder.startRecording();

      recorder.recordChunk(Buffer.from('first'), 'stdout');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      recorder.recordChunk(Buffer.from('second'), 'stdout');

      const recording = recorder.stopRecording();

      expect(recording.chunks[1].relativeTime).toBeGreaterThan(
        recording.chunks[0].relativeTime
      );
      // Should be at least 50ms apart
      expect(
        recording.chunks[1].relativeTime - recording.chunks[0].relativeTime
      ).toBeGreaterThanOrEqual(40); // Allow some timing variance
    });
  });

  describe('stdin recording', () => {
    it('should record stdin events', () => {
      recorder.startRecording();

      const stdinData = '{"type":"user","message":{"content":[{"type":"text","text":"hello"}]}}';
      recorder.recordStdin(stdinData);

      const recording = recorder.stopRecording();

      expect(recording.stdinEvents).toHaveLength(1);
      expect(recording.stdinEvents[0].data).toBe(stdinData);
      expect(recording.stdinEvents[0].timestamp).toBeGreaterThan(0);
      expect(recording.stdinEvents[0].relativeTime).toBeGreaterThanOrEqual(0);
    });

    it('should record multiple stdin events', () => {
      recorder.startRecording();

      recorder.recordStdin('message1');
      recorder.recordStdin('message2');

      const recording = recorder.stopRecording();

      expect(recording.stdinEvents).toHaveLength(2);
    });
  });

  describe('recording state', () => {
    it('should not record when not started', () => {
      // Don't call startRecording
      recorder.recordChunk(Buffer.from('ignored'), 'stdout');
      recorder.recordStdin('ignored');

      recorder.startRecording();
      const recording = recorder.stopRecording();

      expect(recording.chunks).toHaveLength(0);
      expect(recording.stdinEvents).toHaveLength(0);
    });

    it('should not record after stopping', () => {
      recorder.startRecording();
      recorder.recordChunk(Buffer.from('before'), 'stdout');
      recorder.stopRecording();

      recorder.recordChunk(Buffer.from('after'), 'stdout');

      recorder.startRecording();
      const recording = recorder.stopRecording();

      expect(recording.chunks).toHaveLength(0);
    });

    it('should reset on new recording', () => {
      recorder.startRecording();
      recorder.recordChunk(Buffer.from('first session'), 'stdout');
      recorder.stopRecording();

      recorder.startRecording();
      recorder.recordChunk(Buffer.from('second session'), 'stdout');
      const recording = recorder.stopRecording();

      expect(recording.chunks).toHaveLength(1);
      const decoded = Buffer.from(recording.chunks[0].data, 'base64').toString('utf-8');
      expect(decoded).toBe('second session');
    });
  });

  describe('export', () => {
    it('should export to JSON format', () => {
      recorder.startRecording();
      recorder.recordChunk(Buffer.from('test data'), 'stdout');
      recorder.recordStdin('test input');

      const jsonStr = recorder.exportForReplay();
      const parsed = JSON.parse(jsonStr);

      expect(parsed.startTime).toBeGreaterThan(0);
      expect(parsed.chunks).toHaveLength(1);
      expect(parsed.stdinEvents).toHaveLength(1);
    });

    it('should produce valid JSON that can be reimported', () => {
      recorder.startRecording();
      recorder.recordChunk(Buffer.from('{"type":"system"}'), 'stdout');
      recorder.recordStdin('{"type":"user"}');
      const recording = recorder.stopRecording();

      const jsonStr = recorder.exportForReplay();
      const reimported = JSON.parse(jsonStr) as StreamRecording;

      expect(reimported.startTime).toBe(recording.startTime);
      expect(reimported.chunks).toHaveLength(recording.chunks.length);
      expect(reimported.stdinEvents).toHaveLength(recording.stdinEvents.length);
    });
  });

  describe('binary data handling', () => {
    it('should handle binary data correctly via base64', () => {
      recorder.startRecording();

      // Create some binary data (not valid UTF-8)
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      recorder.recordChunk(binaryData, 'stdout');

      const recording = recorder.stopRecording();
      const jsonStr = recorder.exportForReplay();

      // Should be able to parse and decode
      const parsed = JSON.parse(jsonStr);
      const decoded = Buffer.from(parsed.chunks[0].data, 'base64');

      expect(decoded).toEqual(binaryData);
    });
  });
});
