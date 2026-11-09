interface ImportMetaEnv {
    VITE_BASE_MIDDLEWARE: string;
    VITE_BASE_SERVICES: string;
    VITE_WEBSOCKET_URL?: string;
  }
  
  interface ImportMeta {
    env: ImportMetaEnv;
  }
