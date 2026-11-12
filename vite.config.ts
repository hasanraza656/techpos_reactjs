import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      manifest: {
        name: "Tech POS",
        short_name: "Tech POS",
        description: "Your business, thoughtfully connected.",
        start_url: "/",
        display: "standalone",
        background_color: "#f5f7f6",
        theme_color: "#126c51",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,woff2}"] },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": process.env.TECHPOS_BACKEND_URL ?? "http://127.0.0.1:8000",
      "/sanctum": process.env.TECHPOS_BACKEND_URL ?? "http://127.0.0.1:8000",
    },
  },
});
