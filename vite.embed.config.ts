import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * The note editor alone (embed.html), for the native apps to bundle and show from their own files
 * (file:// or an app-assets address): relative paths, one classic script (module scripts don't load
 * from file://), everything (KaTeX's fonts too) in dist/embed/.
 */
export default defineConfig({
  plugins: [react(), classicScripts()],
  base: "./",
  // The app's public files (icons, the Outlook add-in) aren't the editor's.
  publicDir: false,
  build: {
    outDir: "dist/embed",
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: "embed.html",
      output: { format: "iife", inlineDynamicImports: true },
    },
  },
});

/** Plain deferred scripts and stylesheets, without the module and CORS attributes file:// trips over. */
function classicScripts(): Plugin {
  return {
    name: "classic-scripts",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler: (html) => html.replace(/<script type="module" crossorigin/g, "<script defer").replace(/ crossorigin(?=[ >])/g, ""),
    },
  };
}
