import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { appendFileSync, mkdirSync } from "node:fs";

/** The dev server keeps what a page opened with `?diag` tells it (out/diag.log): for a browser nobody here can drive. */
const diag: Plugin = {
  name: "diag",
  configureServer(server) {
    server.middlewares.use("/__diag", (req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        mkdirSync("out", { recursive: true });
        appendFileSync("out/diag.log", `${body.slice(0, 500)}\n`);
        res.end("ok");
      });
    });
  },
};

// BASE_PATH is the folder the site is served from: "/" at home, "/<repo>/" on GitHub Pages
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), diag],
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: true },
  server: { host: "127.0.0.1", port: 5337, strictPort: true, allowedHosts: true },
  preview: { host: "127.0.0.1", port: 5338, strictPort: true, allowedHosts: true },
});
