/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />

import path from "node:path";
import { defineConfig, loadEnv } from 'vite';
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  return {
    plugins: [
      react({
        babel: {
          plugins: ["@lingui/babel-plugin-lingui-macro"],
        },
      }),
    ],
    base: "./",
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
      include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
      alias: {
        // Replace @lingui/react with a lightweight mock so useLingui() works
        // without requiring I18nProvider in every test render tree
        "@lingui/react": path.resolve("./tests/mocks/lingui-react.ts"),
      },
    },
    define: {
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
      '__APP_NAME__': JSON.stringify(process.env.npm_package_name),
      '__APP_DESCRIPTION__': JSON.stringify(process.env.npm_package_description),
      '__DEFAULT_IRC_SERVER__': JSON.stringify(process.env.VITE_DEFAULT_IRC_SERVER),
      '__DEFAULT_IRC_SERVER_NAME__': JSON.stringify(process.env.VITE_DEFAULT_IRC_SERVER_NAME),
      '__DEFAULT_IRC_CHANNELS__': process.env.VITE_DEFAULT_IRC_CHANNELS ? process.env.VITE_DEFAULT_IRC_CHANNELS.replace(/^['"]|['"]$/g, '').split(',').map(ch => ch.trim()) : [],
      '__HIDE_SERVER_LIST__': process.env.VITE_HIDE_SERVER_LIST === 'true',
      '__DEFAULT_OAUTH_PROVIDER_LABEL__': JSON.stringify(process.env.VITE_DEFAULT_OAUTH_PROVIDER_LABEL),
      '__DEFAULT_OAUTH_ISSUER__': JSON.stringify(process.env.VITE_DEFAULT_OAUTH_ISSUER),
      '__DEFAULT_OAUTH_CLIENT_ID__': JSON.stringify(process.env.VITE_DEFAULT_OAUTH_CLIENT_ID),
      '__DEFAULT_OAUTH_SCOPES__': JSON.stringify(process.env.VITE_DEFAULT_OAUTH_SCOPES),
      '__DEFAULT_OAUTH_REDIRECT_URI__': JSON.stringify(process.env.VITE_DEFAULT_OAUTH_REDIRECT_URI),
      '__DEFAULT_OAUTH_TOKEN_KIND__': JSON.stringify(process.env.VITE_DEFAULT_OAUTH_TOKEN_KIND),
      '__DEFAULT_OAUTH_SERVER_PROVIDER__': JSON.stringify(process.env.VITE_DEFAULT_OAUTH_SERVER_PROVIDER),
      '__DEFAULT_OAUTH_AUTHORIZE_URL__': JSON.stringify(process.env.VITE_DEFAULT_OAUTH_AUTHORIZE_URL),
      '__DEFAULT_OAUTH_TOKEN_URL__': JSON.stringify(process.env.VITE_DEFAULT_OAUTH_TOKEN_URL),
      '__BACKEND_URL__': JSON.stringify(process.env.VITE_BACKEND_URL || 'http://localhost:8080'),
      '__TRUSTED_MEDIA_URLS__': process.env.VITE_TRUSTED_MEDIA_URLS ? process.env.VITE_TRUSTED_MEDIA_URLS.replace(/^['"]|['"]$/g, '').split(',').map(url => url.trim()) : [],
    },
    // prevent vite from obscuring rust errors
    clearScreen: false,
    // Tauri expects a fixed port, fail if that port is not available
    server: {
      strictPort: true,
      cors: true,
    },
    // to access the Tauri environment variables set by the CLI with information about the current target
    envPrefix: ['VITE_', 'TAURI_PLATFORM', 'TAURI_ARCH', 'TAURI_FAMILY', 'TAURI_PLATFORM_VERSION', 'TAURI_PLATFORM_TYPE', 'TAURI_DEBUG'],
    build: {
      // Main chunk includes the full app + react-icons/fa (~35 files); gzip is ~570KB which is fine.
      chunkSizeWarningLimit: 3000,
      // Tauri uses Chromium on Windows and WebKit on macOS and Linux
      target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
      // don't minify for debug builds
      minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
      // produce sourcemaps for debug builds
      sourcemap: !!process.env.TAURI_DEBUG,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-markdown': ['marked', 'dompurify'],
            'vendor-zustand': ['zustand'],
          },
        },
      },
    }
  };
});
