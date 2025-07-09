interface ImportMetaEnv {
    VITE_BASE_MIDDLEWARE: string;
    VITE_BASE_RECAPTCHA_KEY: string;
  }
  
  interface ImportMeta {
    env: ImportMetaEnv;
  }