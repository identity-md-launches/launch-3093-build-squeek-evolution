import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const normal = createRequire(resolve(root, "package.json"));
let req = normal;
try {
  normal.resolve("vite");
} catch {
  req = createRequire(resolve(root, "test/scratch/runtime/package.json"));
}
export const dependencyRoot = dirname(
  dirname(req.resolve("vite/package.json")),
);
const name = process.argv[2];
const run = (bin, args) =>
  new Promise((done) => {
    const c = spawn(process.execPath, [bin, ...args], {
      stdio: "inherit",
      cwd: root,
    });
    const stop = () => c.kill("SIGTERM");
    const interrupt = () => c.kill("SIGINT");
    process.once("SIGTERM", stop);
    process.once("SIGINT", interrupt);
    c.on("exit", (code) => {
      process.removeListener("SIGTERM", stop);
      process.removeListener("SIGINT", interrupt);
      done(code ?? 1);
    });
    c.on("error", () => done(1));
  });
mkdirSync(resolve(root, "test/scratch"), { recursive: true });
if (name === "typecheck") {
  const config = {
    extends: "../../tsconfig.json",
    compilerOptions: {
      baseUrl: root,
      paths: {
        react: [`${dependencyRoot}/@types/react`],
        "react/*": [`${dependencyRoot}/@types/react/*`],
        "react-dom/*": [`${dependencyRoot}/@types/react-dom/*`],
        "*": [`${dependencyRoot}/*`],
      },
      typeRoots: [`${dependencyRoot}/@types`],
    },
    include: [`${root}/src`, `${root}/server`, `${root}/scripts/*.ts`],
  };
  writeFileSync(
    resolve(root, "test/scratch/tsconfig.json"),
    JSON.stringify(config),
  );
  process.exit(
    await run(req.resolve("typescript/bin/tsc"), [
      "--project",
      "test/scratch/tsconfig.json",
      "--noEmit",
    ]),
  );
}
if (["build", "preview", "dev"].includes(name)) {
  process.env.SQUEEK_DEPENDENCY_ROOT = dependencyRoot;
  process.exit(
    await run(
      resolve(dirname(req.resolve("vite/package.json")), "bin/vite.js"),
      [
        ...(name === "dev" ? [] : [name]),
        ...(name === "build" ? [] : ["--host", "0.0.0.0"]),
        ...process.argv.slice(3),
      ],
    ),
  );
}
const entries = {
  smoke: "scripts/smoke.ts",
  share: "scripts/share.ts",
  server: "server/index.ts",
  test: "scripts/test.ts",
  live: "scripts/live.ts",
  "live-browser": "scripts/live-browser.ts",
  browser: "scripts/browser.ts",
  revision: "scripts/revision.ts",
};
if (!entries[name]) throw Error("Unknown command");
const { build } = req("esbuild");
const outfile = resolve(root, `test/scratch/${name}.mjs`);
await build({
  entryPoints: [resolve(root, entries[name])],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  nodePaths: [dependencyRoot],
  external: ["playwright", "playwright-core"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
if (["browser", "revision", "live-browser", "share"].includes(name))
  process.env.SQUEEK_PLAYWRIGHT = resolve(
    dirname(req.resolve("playwright/package.json")),
    "index.mjs",
  );
process.exit(await run(outfile, process.argv.slice(3)));
