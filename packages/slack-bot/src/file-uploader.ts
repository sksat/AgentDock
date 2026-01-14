import type { WebClient } from '@slack/web-api';
import * as fs from 'fs';
import * as path from 'path';

// Supported image extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Base64 prefixes for common image formats
const BASE64_PNG_PREFIX = 'iVBORw0KGgo';
const BASE64_JPEG_PREFIX = '/9j/';
const BASE64_GIF_PREFIX = 'R0lGOD';

/**
 * Check if a path is an image file.
 */
export function isImagePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Extract potential file paths from text content.
 * Looks for absolute paths that might be images.
 */
export function extractImagePaths(content: string): string[] {
  const paths: string[] = [];

  // Match absolute paths (Unix-style) - more permissive pattern
  // Allows spaces and more special characters in paths
  const pathPattern = /\/(?:[^\s:*?"<>|]+\/)*[^\s:*?"<>|]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg)/gi;
  const matches = content.match(pathPattern);

  console.log('[DEBUG] extractImagePaths - content length:', content.length);
  console.log('[DEBUG] extractImagePaths - regex matches:', matches);

  if (matches) {
    for (const match of matches) {
      // Check if file exists and is within size limit
      try {
        const stats = fs.statSync(match);
        if (stats.isFile() && stats.size <= MAX_FILE_SIZE) {
          console.log('[DEBUG] extractImagePaths - valid file:', match, 'size:', stats.size);
          paths.push(match);
        } else {
          console.log('[DEBUG] extractImagePaths - invalid file (not file or too large):', match);
        }
      } catch (error) {
        // File doesn't exist or not accessible
        console.log('[DEBUG] extractImagePaths - file not accessible:', match, error);
      }
    }
  }

  return [...new Set(paths)]; // Remove duplicates
}

/**
 * Upload a file to Slack.
 */
export async function uploadFile(
  client: WebClient,
  filePath: string,
  channel: string,
  threadTs: string,
  comment?: string
): Promise<{ ok: boolean; permalink?: string; error?: string }> {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `File not found: ${filePath}` };
    }

    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      return { ok: false, error: `File too large: ${filePath}` };
    }

    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const result = await client.files.uploadV2({
      channel_id: channel,
      thread_ts: threadTs,
      file: fileContent,
      filename: fileName,
      initial_comment: comment,
    });

    // Extract permalink from result
    const file = (result as any).file;
    const permalink = file?.permalink;

    return { ok: true, permalink };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to upload file:', errorMessage);
    return { ok: false, error: errorMessage };
  }
}

/**
 * Upload multiple images to Slack.
 */
export async function uploadImages(
  client: WebClient,
  imagePaths: string[],
  channel: string,
  threadTs: string
): Promise<{ uploaded: string[]; failed: string[] }> {
  const uploaded: string[] = [];
  const failed: string[] = [];

  for (const imagePath of imagePaths) {
    const result = await uploadFile(client, imagePath, channel, threadTs);
    if (result.ok) {
      uploaded.push(imagePath);
    } else {
      failed.push(imagePath);
    }
  }

  return { uploaded, failed };
}

/**
 * Process tool result content and upload any images found.
 * Returns the paths of successfully uploaded images.
 */
export async function processAndUploadImages(
  client: WebClient,
  content: string,
  channel: string,
  threadTs: string
): Promise<string[]> {
  const imagePaths = extractImagePaths(content);

  if (imagePaths.length === 0) {
    return [];
  }

  const { uploaded } = await uploadImages(client, imagePaths, channel, threadTs);
  return uploaded;
}

/**
 * Extract base64 image data from tool_result content.
 * Content format: [{"type":"text","text":"base64data..."}]
 * Returns { data: base64string, extension: 'png'|'jpg'|'gif' } or null if not found.
 */
export function extractBase64Image(content: string): { data: string; extension: string } | null {
  try {
    // Try to parse as JSON array
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    // Look for text item with base64 image data
    for (const item of parsed) {
      if (item.type === 'text' && typeof item.text === 'string') {
        const text = item.text;

        // Check for PNG
        if (text.startsWith(BASE64_PNG_PREFIX)) {
          console.log('[DEBUG] extractBase64Image - found PNG data');
          return { data: text, extension: 'png' };
        }

        // Check for JPEG
        if (text.startsWith(BASE64_JPEG_PREFIX)) {
          console.log('[DEBUG] extractBase64Image - found JPEG data');
          return { data: text, extension: 'jpg' };
        }

        // Check for GIF
        if (text.startsWith(BASE64_GIF_PREFIX)) {
          console.log('[DEBUG] extractBase64Image - found GIF data');
          return { data: text, extension: 'gif' };
        }
      }
    }
  } catch {
    // Not valid JSON, skip
  }

  return null;
}

/**
 * Upload base64 image data to Slack.
 */
export async function uploadBase64Image(
  client: WebClient,
  base64Data: string,
  extension: string,
  channel: string,
  threadTs: string,
  comment?: string
): Promise<{ ok: boolean; permalink?: string; error?: string }> {
  try {
    // Convert base64 to Buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Check size limit
    if (buffer.length > MAX_FILE_SIZE) {
      return { ok: false, error: 'Image too large' };
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot-${timestamp}.${extension}`;

    console.log(`[DEBUG] uploadBase64Image - uploading ${filename}, size: ${buffer.length}`);

    const result = await client.files.uploadV2({
      channel_id: channel,
      thread_ts: threadTs,
      file: buffer,
      filename,
      initial_comment: comment,
    });

    // Extract permalink from result
    const file = (result as { file?: { permalink?: string } }).file;
    const permalink = file?.permalink;

    console.log(`[DEBUG] uploadBase64Image - uploaded successfully, permalink: ${permalink}`);
    return { ok: true, permalink };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to upload base64 image:', errorMessage);
    return { ok: false, error: errorMessage };
  }
}

/**
 * Check if tool_result content contains base64 image data and upload it.
 * Returns true if an image was uploaded.
 */
export async function processAndUploadBase64Image(
  client: WebClient,
  content: string,
  channel: string,
  threadTs: string
): Promise<boolean> {
  const imageData = extractBase64Image(content);

  if (!imageData) {
    return false;
  }

  const result = await uploadBase64Image(
    client,
    imageData.data,
    imageData.extension,
    channel,
    threadTs
  );

  return result.ok;
}

/**
 * Upload text content as a code snippet to Slack.
 * Slack displays snippets as collapsible with "Show more" by default.
 */
export async function uploadTextSnippet(
  client: WebClient,
  content: string,
  channel: string,
  threadTs: string,
  options?: {
    filename?: string;
    title?: string;
    filetype?: string;
  }
): Promise<{ ok: boolean; permalink?: string; error?: string }> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = options?.filename || `snapshot-${timestamp}.txt`;

    console.log(`[DEBUG] uploadTextSnippet - uploading ${filename}, size: ${content.length}`);

    const result = await client.files.uploadV2({
      channel_id: channel,
      thread_ts: threadTs,
      content,
      filename,
      title: options?.title,
      // Use 'text' or 'markdown' for syntax highlighting
      snippet_type: options?.filetype || 'text',
    });

    // Extract permalink from result
    const file = (result as { file?: { permalink?: string } }).file;
    const permalink = file?.permalink;

    console.log(`[DEBUG] uploadTextSnippet - uploaded successfully, permalink: ${permalink}`);
    return { ok: true, permalink };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to upload text snippet:', errorMessage);
    return { ok: false, error: errorMessage };
  }
}
