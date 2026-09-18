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
      // Serve public/<name>/index.html for /<name>/ and /<name> in the dev server.
      // In production, Vite copies public/ to dist/ and the host serves it correctly.
      name: "serve-static-subpages",
      configureServer(server) {
        const pages = ["VLEO", "HAPS", "linktree", "privacy"];
        server.middlewares.use((req, res, next) => {
          for (const page of pages) {
            // Redirect /<name> → /<name>/ so relative URLs (logo, etc.) resolve correctly
            if (req.url === `/${page}`) {
              res.statusCode = 301;
              res.setHeader("Location", `/${page}/`);
              res.end();
              return;
            }
            if (req.url === `/${page}/`) {
              const file = path.resolve(__dirname, `public/${page}/index.html`);
              res.setHeader("Content-Type", "text/html");
              res.end(fs.readFileSync(file));
              return;
            }
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
