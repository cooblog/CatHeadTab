/**
 * CatHeadTab Runtime Configuration
 * 
 * This file provides a mechanism for injecting configuration at runtime (e.g. via Docker envsubst)
 * without violating Content Security Policy (CSP) regarding inline scripts.
 */
window.__RUNTIME_CONFIG__ = {
  // Placeholder to be replaced by Docker entrypoint (sed)
  API_URL: "__VITE_API_URL__"
};
