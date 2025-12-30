import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Try to load env, but don't fail if .env file has permission issues
    let env = {};
    try {
      env = loadEnv(mode, '.', '');
    } catch (error) {
      console.warn('Warning: Could not load .env file:', error);
      // Continue without env variables - they're optional for dev server startup
    }
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/sheets': {
            target: 'http://localhost:3001',
            changeOrigin: true,
            secure: false,
          }
        }
      },
      plugins: [
        react(),
        // Plugin to inject build hash into HTML for version checking
        {
          name: 'inject-build-hash',
          transformIndexHtml(html) {
            // Generate a build hash based on timestamp
            const buildHash = Date.now().toString(36);
            // Inject as meta tag in the head
            return html.replace(
              '<head>',
              `<head>\n    <meta name="app-build-hash" content="${buildHash}">`
            );
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        }
      },
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        coverage: {
          provider: 'v8',
          reporter: ['text', 'json', 'html'],
          exclude: [
            'node_modules/',
            'src/test/',
            '**/*.d.ts',
            '**/*.config.*',
            '**/mockData',
            'dist/',
          ],
        },
      },
    };
});
