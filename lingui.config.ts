import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "es", "fr", "zh", "pt", "de", "it", "ro"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
      exclude: ["**/node_modules/**", "<rootDir>/src/locales/**"],
    },
  ],
  format: formatter({ lineNumbers: false }),
  compileNamespace: "es",
});
