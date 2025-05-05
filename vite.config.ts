/// <reference types="vitest" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
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
  }
});
