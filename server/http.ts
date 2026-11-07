import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { ApiError, errorResponse, type createService } from "./service";
export type HttpSettings = {
  port: number;
  publicOrigin: string;
  allowedOrigins: string[];
};
export function createHttpServer(
  settings: HttpSettings,
  service: ReturnType<typeof createService>,
) {
  const dist = resolve("dist");
  const limits = new Map<string, { count: number; at: number }>();
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const allowed = !origin || settings.allowedOrigins.includes(origin);
    if (!allowed) {
      res.writeHead(403);
      res.end("Origin not allowed");
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, OPTIONS",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", settings.publicOrigin);
    if (url.pathname.startsWith("/api/")) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      try {
        const ip = req.socket.remoteAddress ?? "local",
          t = Date.now(),
          l = limits.get(ip);
        if (l && t - l.at < 60000) {
          l.count++;
          if (l.count > 120)
            throw new ApiError(
              429,
              "Too many requests. Try again in a minute.",
            );
        } else limits.set(ip, { count: 1, at: t });
        if (limits.size > 10000)
          for (const [k, v] of limits) if (t - v.at > 60000) limits.delete(k);
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 65536)
            throw new ApiError(413, "Request is too large.");
        }
        let body: Record<string, unknown> = {};
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            throw new ApiError(400, "Request must be JSON.");
          }
          if (!body || typeof body !== "object" || Array.isArray(body))
            throw new ApiError(400, "Request must be an object.");
        }
        const result = await service.handle(
          req.method ?? "GET",
          url.pathname,
          body,
          req.headers.authorization?.replace(/^Bearer /, "") ?? "",
        );
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (e) {
        const r = errorResponse(e);
        res.writeHead(r.status);
        res.end(JSON.stringify(r));
      }
      return;
    }
    if (url.pathname === "/runtime-config.json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ sameOriginService: true, serviceUrl: "" }));
      return;
    }
    try {
      const path = resolve(
        dist,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
      if (!path.startsWith(dist + sep)) throw Error();
      if (!(await stat(path)).isFile()) throw Error();
      const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".woff2": "font/woff2",
        ".png": "image/png",
      };
      res.setHeader(
        "Content-Type",
        types[extname(path)] ?? "application/octet-stream",
      );
      res.end(await readFile(path));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  return server;
}
