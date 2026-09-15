import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

function telegramStickers(): Plugin {
  return {
    name: "tgs-as-lottie",
    enforce: "pre",
    load(id) {
      const [file] = id.split("?");
      if (!file.endsWith(".tgs")) return null;
      this.addWatchFile(file);
      const json = gunzipSync(readFileSync(file)).toString("utf8");
      return `export default JSON.parse(${JSON.stringify(json)})`;
    },
  };
}

export default defineConfig(async () => ({
  plugins: [react(), telegramStickers()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
