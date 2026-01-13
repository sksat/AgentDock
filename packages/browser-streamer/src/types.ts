/**
 * Options for configuring the screencast
 */
export interface ScreencastOptions {
  /** Image format for the screencast frames */
  format?: 'jpeg' | 'png';
  /** Image quality (1-100), only applies to jpeg format */
  quality?: number;
  /** Maximum width of the frame */
  maxWidth?: number;
  /** Maximum height of the frame */
  maxHeight?: number;
  /** Only capture every Nth frame (1 = all frames) */
  everyNthFrame?: number;
}

/**
 * Metadata about a screencast frame
 */
export interface FrameMetadata {
  /** Device width in pixels */
  deviceWidth: number;
  /** Device height in pixels */
  deviceHeight: number;
  /** Offset from top of the page */
  offsetTop: number;
  /** Page scale factor */
  pageScaleFactor: number;
  /** Horizontal scroll offset */
  scrollOffsetX: number;
  /** Vertical scroll offset */
  scrollOffsetY: number;
  /** Timestamp when the frame was captured */
  timestamp: number;
}

/**
 * A single frame from the screencast
 */
export interface FrameData {
  /** Base64 encoded image data */
  data: string;
  /** Metadata about the frame */
  metadata: FrameMetadata;
}

/**
 * Events emitted by BrowserStreamer
 */
export interface BrowserStreamerEvents {
  /** Emitted when a new frame is available */
  frame: (frame: FrameData) => void;
  /** Emitted when an error occurs */
  error: (error: Error) => void;
}
