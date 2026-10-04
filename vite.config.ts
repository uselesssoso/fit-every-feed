import { defineConfig } from "vite";

export default defineConfig({
  base: "/fit-every-feed/",
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: "es2022" },
});
