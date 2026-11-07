import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createPublicClient, http, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { createService } from "./service";
import { createHttpServer } from "./http";
const args = process.argv.slice(2);
const settingsPath = args.includes("--config")
  ? args[args.indexOf("--config") + 1]
  : "server/settings.json";
const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
  port: number;
  publicOrigin: string;
  allowedOrigins: string[];
  databasePath: string;
  rpcUrl: string;
};
const dbPath = resolve(settings.databasePath);
mkdirSync(dirname(dbPath), { recursive: true });
const service = createService({
  databasePath: dbPath,
  publicOrigin: settings.publicOrigin,
  client: createPublicClient({
    chain: sepolia,
    transport: http(settings.rpcUrl, { timeout: 15000, retryCount: 1 }),
  }) as PublicClient,
});
const server = createHttpServer(settings, service);
server.listen(settings.port, "0.0.0.0", () =>
  console.log(
    `Squeek Evolution service on ${settings.publicOrigin}; persistent SQLite storage enabled.`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () =>
    server.close(() => {
      service.close();
      process.exit(0);
    }),
  );
