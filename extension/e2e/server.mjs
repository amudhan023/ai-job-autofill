// Minimal static server for E2E fixtures. Started by Playwright's webServer.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "fixtures");
const port = Number(process.env.E2E_PORT ?? 5566);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = normalize(join(root, rel));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(port, () => console.log(`fixtures on http://localhost:${port}`));
