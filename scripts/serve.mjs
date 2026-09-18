import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const { base } = JSON.parse(
  await fs.readFile(path.join(root, "build-info.json"), "utf8"),
);
const port = Number(process.env.PORT || 8787);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (pathname === "/" && base !== "/") {
        res.writeHead(302, { Location: base });
        res.end();
        return;
      }
      if (!pathname.startsWith(base)) throw new Error("Not found");
      let target = path.resolve(root, pathname.slice(base.length));
      if (target !== root && !target.startsWith(root + path.sep))
        throw new Error("Not found");
      if ((await fs.stat(target)).isDirectory()) {
        if (!pathname.endsWith("/")) {
          res.writeHead(302, { Location: pathname + "/" });
          res.end();
          return;
        }
        target = path.join(target, "index.html");
      }
      const data = await fs.readFile(target);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await fs.readFile(path.join(root, "404.html")));
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Bookshelf preview: http://127.0.0.1:${port}${base}`),
  );
