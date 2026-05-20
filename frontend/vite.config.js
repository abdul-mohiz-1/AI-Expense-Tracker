import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // ── Dev server ────────────────────────────────────────────────────────────
  server: {
    port: 5173,
    open: true,   // auto-open browser on `npm run dev`

    proxy: {
      /**
       * CRITICAL: Any request from the frontend starting with /api
       * is transparently forwarded to the Flask backend on port 5000.
       *
       * This eliminates CORS errors entirely during development:
       *   Frontend:  http://localhost:5173/api/auth/login
       *   Proxied →  http://localhost:5000/api/auth/login
       *
       * Note: Ensure VITE_API_BASE_URL in api.js uses a relative path
       * (empty string '') or '/api' so requests go through this proxy.
       * The current api.js uses '/api' prefix on all endpoints, so the
       * Axios baseURL should be '' (empty) in dev to leverage the proxy.
       */
      '/api': {
        target:      'http://localhost:5000',
        changeOrigin: true,
        secure:       false,

        // Optional: strip /api prefix before forwarding if Flask routes
        // don't include it. Our Flask app DOES use /api prefix, so we
        // do NOT rewrite. Comment out the line below if your Flask routes
        // DON'T have the /api prefix.
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },

  // ── Build output ──────────────────────────────────────────────────────────
  build: {
    outDir:    'dist',
    sourcemap: false,           // set true for production debugging
    minify:    'esbuild',
    rollupOptions: {
      output: {
        // Split vendor chunks for better long-term caching
        manualChunks: {
          react:    ['react', 'react-dom'],
          router:   ['react-router-dom'],
          recharts: ['recharts'],
        },
      },
    },
  },

  // ── Path aliases ──────────────────────────────────────────────────────────
  resolve: {
    alias: {
      // Uncomment to enable @ imports: import Foo from '@/components/Foo'
      // '@': path.resolve(__dirname, './src'),
    },
  },

  // ── Environment variable prefix ───────────────────────────────────────────
  // Only vars prefixed with VITE_ are exposed to client code.
  // Example: VITE_API_BASE_URL='' in .env.development
  envPrefix: 'VITE_',
});