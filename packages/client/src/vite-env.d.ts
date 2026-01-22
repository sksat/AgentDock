/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Whether running in stable mode (HMR disabled) */
  readonly VITE_STABLE_MODE: boolean;
  /** Server port for WebSocket connection (defaults to 3001) */
  readonly VITE_SERVER_PORT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
