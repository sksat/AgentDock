/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Whether running in stable mode (HMR disabled) */
  readonly VITE_STABLE_MODE: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
