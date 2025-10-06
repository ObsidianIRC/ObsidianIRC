/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />

import { defineConfig, loadEnv } from 'vite';
import react from "@vitejs/plugin-react";


// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  return {
    plugins: [react()],
    base: "./",
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
      include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
    },
    define: {
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
      '__APP_NAME__': JSON.stringify(process.env.npm_package_name),
      '__APP_DESCRIPTION__': JSON.stringify(process.env.npm_package_description),
      '__DEFAULT_IRC_SERVER__': JSON.stringify(process.env.VITE_DEFAULT_IRC_SERVER),
      '__DEFAULT_IRC_SERVER_NAME__': JSON.stringify(process.env.VITE_DEFAULT_IRC_SERVER_NAME),
      '__DEFAULT_IRC_CHANNELS__': process.env.VITE_DEFAULT_IRC_CHANNELS ? process.env.VITE_DEFAULT_IRC_CHANNELS.replace(/^['"]|['"]$/g, '').split(',').map(ch => ch.trim()) : [],
      '__HIDE_SERVER_LIST__': process.env.VITE_HIDE_SERVER_LIST === 'true',
    },
    // prevent vite from obscuring rust errors
    clearScreen: false,
    // Tauri expects a fixed port, fail if that port is not available
    server: {
      strictPort: true,
      cors: true,
      proxy: {
        '/upload': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    // to access the Tauri environment variables set by the CLI with information about the current target
    envPrefix: ['VITE_', 'TAURI_PLATFORM', 'TAURI_ARCH', 'TAURI_FAMILY', 'TAURI_PLATFORM_VERSION', 'TAURI_PLATFORM_TYPE', 'TAURI_DEBUG'],
    build: {
      // Tauri uses Chromium on Windows and WebKit on macOS and Linux
      target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
      // don't minify for debug builds
      minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
      // produce sourcemaps for debug builds
      sourcemap: !!process.env.TAURI_DEBUG,
    }
  };
});
