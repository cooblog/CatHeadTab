import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // --- FORCE OVERRIDE FOR LOCAL DEV ---
  if (mode === 'development') {
    env.VITE_API_URL = 'http://localhost:8080';
    process.env.VITE_API_URL = 'http://localhost:8080';
  }

  console.log(`[ViteConfig] Mode: ${mode}`);
  console.log(`[ViteConfig] Final VITE_API_URL used: ${env.VITE_API_URL || '(not set)'}`);

  const injectPlugin = () => ({
    name: 'inject-config',
    transformIndexHtml(html: string) {
      let res = html;
      
      // For extension builds or production builds where VITE_API_URL is already hardcoded,
      // we could strip it. But for the core Docker/web build, we MUST keep the script
      // so docker-entrypoint.sh can inject the runtime URL.
      // We only strip it if we are sure we don't need runtime injection (e.g. dev mode or if explicitly asked)
      if (mode === 'development') {
        res = res.replace(/[ \t]*<!--[^>]*Runtime config[^>]*-->\r?\n?/i, '');
        res = res.replace(/[ \t]*<script src="\/runtime-config\.js"><\/script>\r?\n?/, '');
      }

      const umamiId = env.VITE_UMAMI_WEBSITE_ID;
      if (umamiId) {
        const umamiSrc = env.VITE_UMAMI_SRC || 'https://analytics.umami.is/script.js';
        res = res.replace(
          '</head>',
          `  <script defer src="${umamiSrc}" data-website-id="${umamiId}"></script>\n  </head>`
        );
      }
      return res;
    }
  });

  return {
    plugins: [
      react(),
      tailwindcss(),
      injectPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          newtab: path.resolve(__dirname, 'index.html'),
          popup: path.resolve(__dirname, 'popup.html'),
          privacy: path.resolve(__dirname, 'privacy.html'),
        },
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/react-router')) {
              return 'vendor-router';
            }
            if (id.includes('node_modules/@dnd-kit')) {
              return 'vendor-dndkit';
            }
            if (id.includes('node_modules/framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('node_modules/ai') || id.includes('node_modules/@ai-sdk')) {
              return 'vendor-ai';
            }
            if (id.includes('node_modules/zod')) {
              return 'vendor-zod';
            }
          },
        },
      },
    },
  };
});
