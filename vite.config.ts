import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Relaxes the strict production <meta http-equiv="Content-Security-Policy">
 * only during `vite` dev-server sessions so HMR WebSockets, the Vite error
 * overlay, and HTTP LAN mobile testing work. Production builds (`vite build`)
 * never run this plugin and keep the full deny-by-default CSP.
 */
function devServerCspPlugin(): Plugin {
  return {
    name: "snakebyte-dev-csp",
    apply: "serve",
    transformIndexHtml(html) {
      const devCsp = [
        "default-src 'none'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss: http: https:",
        "media-src 'none'",
        "object-src 'none'",
        "frame-src 'none'",
        "child-src 'none'",
        "worker-src 'self' blob:",
        "manifest-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "script-src-attr 'none'",
      ].join("; ");
      return html.replace(
        /(<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content=")[^"]*(")/i,
        `$1${devCsp}$2`,
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [devServerCspPlugin(), react(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
});
