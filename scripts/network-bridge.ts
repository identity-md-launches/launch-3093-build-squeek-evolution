import type { BrowserContext, Page } from "playwright";
/** Optional validation-only transport for a sandbox whose browser cannot reach public hosts.
 * Every response is fetched from its real official upstream, unmodified. No fixtures are used.
 * This file is never imported by the app or exported into dist/.
 */
export async function bridgeOfficialNetwork(target: BrowserContext | Page) {
  if (process.env.SQUEEK_TEST_NETWORK_BRIDGE !== "1") return;
  const controllers = new Set<AbortController>();
  const close = () => {
    for (const c of controllers) c.abort();
  };
  if ("pages" in target) target.once("close", close);
  else target.once("close", close);
  await target.route(
    /^https:\/\/(api\.squeekchain\.com|ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.org)\//,
    async (route) => {
      const req = route.request();
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const read = () =>
          fetch(req.url(), {
            method: req.method(),
            headers: {
              Accept: "application/json",
              ...(req.method() === "POST"
                ? { "Content-Type": "application/json" }
                : {}),
            },
            ...(req.postData() ? { body: req.postData()! } : {}),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
          });
        const upstream = await read();
        await route.fulfill({
          status: upstream.status,
          headers: {
            "content-type":
              upstream.headers.get("content-type") ?? "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "cache-control": "no-store",
          },
          body: Buffer.from(await upstream.arrayBuffer()),
        });
      } catch {
        await route
          .fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error:
                "Official upstream unavailable through the validation network bridge.",
            }),
          })
          .catch(() => {});
      } finally {
        controllers.delete(controller);
      }
    },
  );
}
