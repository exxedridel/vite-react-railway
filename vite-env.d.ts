/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_MIDDLEWARE: string;
  readonly VITE_BASE_SERVICES: string;
  readonly VITE_WEBSOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
