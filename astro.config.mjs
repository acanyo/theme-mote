// @ts-check
import { defineConfig } from "astro/config";
import { readFileSync } from "node:fs";

const manifest = readFileSync(new URL("./theme.yaml", import.meta.url), "utf8");
const version = manifest.match(/^  version:\s*"([^"]+)"/m)?.[1];
if (!version) throw new Error("Missing spec.version in theme.yaml");

// Astro builds Thymeleaf templates into ./templates; Halo serves static
// files only from templates/assets, at /themes/{metadata.name}/assets.
export default defineConfig({
  base: "/themes/theme-mote",
  devToolbar: { enabled: false },
  outDir: "./templates",
  build: {
    // A theme version bump also gives CSS and JS fresh cache URLs.
    assets: `assets/${version}`,
    format: "file",
    inlineStylesheets: "never",
  },
  vite: {
    // Keep every script external: inlined code could contain "[[" which
    // Thymeleaf would try to evaluate as an inline expression.
    build: { assetsInlineLimit: 0 },
  },
});
