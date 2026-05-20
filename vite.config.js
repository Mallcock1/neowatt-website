import { defineConfig } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      // Images referenced only as strings in JSON (supporter logos, team photos)
      // are invisible to Vite's bundler, so copy the whole assets/ dir into the
      // build output verbatim. Matches what scripts/build-previews.mjs does.
      name: "copy-assets-dir",
      closeBundle() {
        const src = path.resolve(__dirname, "assets");
        const dest = path.resolve(__dirname, "dist/assets");
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      }
    },
    {
      name: "serve-vleo-static",
      configureServer(server) {
        // Serve public/VLEO/index.html for /VLEO/ and /VLEO in the dev server.
        // In production, Vite copies public/ to dist/ and the host serves it correctly.
        server.middlewares.use((req, res, next) => {
          // Redirect /VLEO → /VLEO/ so relative URLs (logo, etc.) resolve correctly
          if (req.url === "/VLEO") {
            res.statusCode = 301;
            res.setHeader("Location", "/VLEO/");
            res.end();
            return;
          }
          if (req.url === "/VLEO/") {
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
