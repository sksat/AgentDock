import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isImagePath, extractImagePaths } from '../file-uploader.js';
import * as fs from 'fs';

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
});
