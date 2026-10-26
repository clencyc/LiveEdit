/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const aliases = [
      ...(mode === 'e2e' ? [{
        find: '@logto/react',
        replacement: path.resolve(__dirname, 'e2e/mocks/logto.tsx'),
      }] : []),
      {
        find: '@',
        replacement: path.resolve(__dirname, '.'),
      },
    ];

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: [
          '.ngrok-free.app',
          '.ngrok.io',
          'localhost'
        ],
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: aliases,
      },
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './__tests__/setup.ts',
      },
    };
});
