/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL (e.g. "https://api.catheadtab.com"). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
