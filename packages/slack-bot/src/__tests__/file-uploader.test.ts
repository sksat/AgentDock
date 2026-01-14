import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isImagePath, extractImagePaths, uploadTextSnippet, extractBase64Image } from '../file-uploader.js';
import * as fs from 'fs';
import type { WebClient } from '@slack/web-api';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('file-uploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isImagePath', () => {
    it('should return true for PNG files', () => {
      expect(isImagePath('/tmp/screenshot.png')).toBe(true);
      expect(isImagePath('/tmp/screenshot.PNG')).toBe(true);
    });

    it('should return true for JPG files', () => {
      expect(isImagePath('/tmp/photo.jpg')).toBe(true);
      expect(isImagePath('/tmp/photo.jpeg')).toBe(true);
    });

    it('should return true for GIF files', () => {
      expect(isImagePath('/tmp/animation.gif')).toBe(true);
    });

    it('should return true for WebP files', () => {
      expect(isImagePath('/tmp/image.webp')).toBe(true);
    });

    it('should return false for non-image files', () => {
      expect(isImagePath('/tmp/document.pdf')).toBe(false);
      expect(isImagePath('/tmp/script.ts')).toBe(false);
      expect(isImagePath('/tmp/data.json')).toBe(false);
    });
  });

  describe('extractImagePaths', () => {
    it('should extract PNG paths from text', () => {
      const mockStat = { isFile: () => true, size: 1000 };
      vi.mocked(fs.statSync).mockReturnValue(mockStat as any);

      const content = 'Screenshot saved to /tmp/screenshot.png';
      const paths = extractImagePaths(content);

      expect(paths).toContain('/tmp/screenshot.png');
    });

    it('should extract multiple image paths', () => {
      const mockStat = { isFile: () => true, size: 1000 };
      vi.mocked(fs.statSync).mockReturnValue(mockStat as any);

      const content = `
        Files created:
        - /home/user/images/photo1.jpg
        - /home/user/images/photo2.png
      `;
      const paths = extractImagePaths(content);

      expect(paths).toContain('/home/user/images/photo1.jpg');
      expect(paths).toContain('/home/user/images/photo2.png');
    });

    it('should not include files that are too large', () => {
      const mockStat = { isFile: () => true, size: 20 * 1024 * 1024 }; // 20MB
      vi.mocked(fs.statSync).mockReturnValue(mockStat as any);

      const content = 'Large file at /tmp/huge.png';
      const paths = extractImagePaths(content);

      expect(paths).toHaveLength(0);
    });

    it('should handle non-existent files gracefully', () => {
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const content = 'Missing file at /tmp/missing.png';
      const paths = extractImagePaths(content);

      expect(paths).toHaveLength(0);
    });

    it('should deduplicate paths', () => {
      const mockStat = { isFile: () => true, size: 1000 };
      vi.mocked(fs.statSync).mockReturnValue(mockStat as any);

      const content = '/tmp/image.png was saved. Check /tmp/image.png';
      const paths = extractImagePaths(content);

      expect(paths).toHaveLength(1);
      expect(paths[0]).toBe('/tmp/image.png');
    });

    it('should not match non-image extensions', () => {
      const mockStat = { isFile: () => true, size: 1000 };
      vi.mocked(fs.statSync).mockReturnValue(mockStat as any);

      const content = 'File at /tmp/document.pdf and /tmp/script.ts';
      const paths = extractImagePaths(content);

      expect(paths).toHaveLength(0);
    });
  });

  describe('extractBase64Image', () => {
    it('should extract PNG base64 data', () => {
      const content = JSON.stringify([{ type: 'text', text: 'iVBORw0KGgoAAAANSUhEUgAAAAEA...' }]);
      const result = extractBase64Image(content);
      expect(result).not.toBeNull();
      expect(result?.extension).toBe('png');
      expect(result?.data).toContain('iVBORw0KGgo');
    });

    it('should extract JPEG base64 data', () => {
      const content = JSON.stringify([{ type: 'text', text: '/9j/4AAQSkZJRgABAQAAAQABAAD...' }]);
      const result = extractBase64Image(content);
      expect(result).not.toBeNull();
      expect(result?.extension).toBe('jpg');
    });

    it('should extract GIF base64 data', () => {
      const content = JSON.stringify([{ type: 'text', text: 'R0lGODlhAQABAIAAAAAAAP///...' }]);
      const result = extractBase64Image(content);
      expect(result).not.toBeNull();
      expect(result?.extension).toBe('gif');
    });

    it('should return null for non-JSON content', () => {
      const content = 'plain text content';
      const result = extractBase64Image(content);
      expect(result).toBeNull();
    });

    it('should return null for non-image base64 data', () => {
      const content = JSON.stringify([{ type: 'text', text: 'regular text content' }]);
      const result = extractBase64Image(content);
      expect(result).toBeNull();
    });

    it('should return null for empty array', () => {
      const content = JSON.stringify([]);
      const result = extractBase64Image(content);
      expect(result).toBeNull();
    });
  });

  describe('uploadTextSnippet', () => {
    const createMockClient = () => {
      return {
        files: {
          uploadV2: vi.fn(),
        },
      } as unknown as WebClient;
    };

    it('should upload text content as snippet', async () => {
      const mockClient = createMockClient();
      vi.mocked(mockClient.files.uploadV2).mockResolvedValue({
        ok: true,
        file: { permalink: 'https://slack.com/files/123' },
      } as any);

      const result = await uploadTextSnippet(
        mockClient,
        'Hello world content',
        'C123',
        '1234567890.123456'
      );

      expect(result.ok).toBe(true);
      expect(result.permalink).toBe('https://slack.com/files/123');
      expect(mockClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: 'C123',
          thread_ts: '1234567890.123456',
          content: 'Hello world content',
        })
      );
    });

    it('should use custom filename when provided', async () => {
      const mockClient = createMockClient();
      vi.mocked(mockClient.files.uploadV2).mockResolvedValue({ ok: true } as any);

      await uploadTextSnippet(mockClient, 'content', 'C123', 'ts', {
        filename: 'custom.md',
      });

      expect(mockClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'custom.md',
        })
      );
    });

    it('should use custom title when provided', async () => {
      const mockClient = createMockClient();
      vi.mocked(mockClient.files.uploadV2).mockResolvedValue({ ok: true } as any);

      await uploadTextSnippet(mockClient, 'content', 'C123', 'ts', {
        title: 'My Snippet Title',
      });

      expect(mockClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Snippet Title',
        })
      );
    });

    it('should use custom filetype when provided', async () => {
      const mockClient = createMockClient();
      vi.mocked(mockClient.files.uploadV2).mockResolvedValue({ ok: true } as any);

      await uploadTextSnippet(mockClient, 'content', 'C123', 'ts', {
        filetype: 'markdown',
      });

      expect(mockClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          snippet_type: 'markdown',
        })
      );
    });

    it('should handle upload errors', async () => {
      const mockClient = createMockClient();
      vi.mocked(mockClient.files.uploadV2).mockRejectedValue(new Error('Upload failed'));

      const result = await uploadTextSnippet(mockClient, 'content', 'C123', 'ts');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Upload failed');
    });

    it('should generate default filename with timestamp', async () => {
      const mockClient = createMockClient();
      vi.mocked(mockClient.files.uploadV2).mockResolvedValue({ ok: true } as any);

      await uploadTextSnippet(mockClient, 'content', 'C123', 'ts');

      expect(mockClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringMatching(/^snapshot-\d{4}-\d{2}-\d{2}T.*\.txt$/),
        })
      );
    });
  });
});
