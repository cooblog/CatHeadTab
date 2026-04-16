import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const injectPlugin = () => ({
    name: 'inject-config',
    transformIndexHtml(html: string) {
      const apiUrl = env.VITE_API_URL || '';
      let res = html.replace('__VITE_API_URL__', apiUrl);
      
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
    port: 5174,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        newtab: path.resolve(__dirname, 'index.html'),
        popup: path.resolve(__dirname, 'popup.html'),
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
