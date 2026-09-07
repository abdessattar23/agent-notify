import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { loadLocalEnv } from "./env.ts";
import { handleLocalApi } from "./router.ts";

const PORT = Number(process.env.PORT || 43177);
const HOST = process.env.HOST || "127.0.0.1";
const preview = process.env.PREVIEW === "1" || process.argv.includes("--preview");

await loadLocalEnv();

const server = createServer(async (req, res) => {
  try {
    if (await handleLocalApi(req, res)) {
      return;
    }
    if (preview) {
      await serveStatic(req, res);
      return;
    }
    const vite = await getVite();
    vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end("Not found");
    });
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "server_error" }));
  }
});

server.listen(PORT, HOST, () => {
  const mode = preview ? "preview" : "dev";
  console.log(`agent-notify ${mode} http://${HOST}:${PORT}`);
  console.log(`API health  http://${HOST}:${PORT}/api/health`);
  if (!process.env.AGENT_API_TOKEN) {
    console.log("AGENT_API_TOKEN is empty. Set it before testing /v1/notify.");
  }
});

let vitePromise: Promise<import("vite").ViteDevServer> | null = null;

async function getVite() {
  if (!vitePromise) {
    const { createServer } = await import("vite");
    vitePromise = createServer({
      server: { middlewareMode: true, host: HOST, port: PORT },
      appType: "spa",
    });
  }
  return vitePromise;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const dist = join(process.cwd(), "dist");
  const requested = join(dist, decodeURIComponent(url.pathname));
  const safeBase = join(dist, "x").slice(0, -1);
  const file = requested.startsWith(safeBase) && existsSync(requested) && !requested.endsWith("/")
    ? requested
    : join(dist, "index.html");
  if (!existsSync(file)) {
    res.statusCode = 404;
    res.end("Build the app first with npm run build");
    return;
  }
  res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
  if (file.endsWith("index.html")) {
    res.end(await readFile(file));
    return;
  }
  createReadStream(file).pipe(res);
}
