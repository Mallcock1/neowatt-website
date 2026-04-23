import { defineConfig } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: "serve-vleo-static",
      configureServer(server) {
        // Serve public/VLEO/index.html for /VLEO/ and /VLEO in the dev server.
        // In production, Vite copies public/ to dist/ and the host serves it correctly.
        server.middlewares.use((req, res, next) => {
          if (req.url === "/VLEO/" || req.url === "/VLEO") {
            const file = path.resolve(__dirname, "public/VLEO/index.html");
            res.setHeader("Content-Type", "text/html");
            res.end(fs.readFileSync(file));
            return;
          }
          next();
        });
      }
    }
  ],
  server: {
    host: true,
    port: 5173
  }
});
