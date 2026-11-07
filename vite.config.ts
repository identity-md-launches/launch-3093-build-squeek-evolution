import { createRequire } from "node:module";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const req = createRequire(
  resolve(
    process.env.SQUEEK_DEPENDENCY_ROOT || "node_modules",
    "../package.json",
  ),
);
export default {
  base: "./",
  plugins: [
    {
      name: "local-dependencies",
      enforce: "pre",
      resolveId(source: string) {
        if (
          /^(react|react-dom|wagmi|viem|lucide-react|@tanstack\/react-query)(\/|$)/.test(
            source,
          )
        ) {
          try {
            const entry = req.resolve(source);
            const esm = entry
              .replace("/_cjs/", "/_esm/")
              .replace("/dist/cjs/", "/dist/esm/")
              .replace(/\.cjs$/, ".js");
            return existsSync(esm) ? esm : entry;
          } catch {
            return null;
          }
        }
      },
    },
  ],
  esbuild: { jsx: "automatic" },
  build: { target: "es2022", chunkSizeWarningLimit: 800 },
  optimizeDeps: {
    esbuildOptions: {
      nodePaths: [process.env.SQUEEK_DEPENDENCY_ROOT || "node_modules"],
    },
  },
};
