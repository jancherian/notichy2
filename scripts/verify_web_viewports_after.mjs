import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../coucou-windows-v0.5.3/windows/dist");
const outDir = path.resolve(__dirname, "../diagnostics/web_viewports_after");

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
    ".wasm": "application/wasm",
    ".task": "application/octet-stream",
  };
  return map[ext] || "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const safeUrl = (req.url || "/").split("?")[0];
  let filePath = path.join(distDir, safeUrl === "/" ? "index.html" : safeUrl);
  if (!fs.existsSync(filePath) && fs.existsSync(filePath + ".html")) {
    filePath += ".html";
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, {
      "Content-Type": getMime(filePath),
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
});

const resolutions = [
  { w: 1024, h: 600 },
  { w: 1280, h: 720 },
  { w: 1366, h: 768 },
  { w: 1536, h: 864 },
  { w: 1920, h: 1080 },
];
const scales = [1, 1.25, 1.5];
const tabs = ["focus", "tasks", "habits", "wellbeing", "insights", "settings"];

server.listen(4176, async () => {
  console.log("Serving dist on http://127.0.0.1:4176");
  const browser = await chromium.launch({ headless: true });

  const results = [];
  let failures = 0;

  for (const res of resolutions) {
    for (const scale of scales) {
      console.log(`\nVerifying Viewport ${res.w}x${res.h} @ scale ${scale}x...`);
      const context = await browser.newContext({
        viewport: { width: res.w, height: res.h },
        deviceScaleFactor: scale,
      });
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4176", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);

      // Verify boot ready marker within 1s on web
      const isReady = await page.evaluate(() => document.body.dataset.ready === "1");
      if (!isReady) {
        console.error(`BOOT_READY marker missing at ${res.w}x${res.h}!`);
        failures++;
      }

      for (const tab of tabs) {
        // Expand and switch to tab
        await page.evaluate((t) => {
          window.island.expand(t);
        }, tab);
        await page.waitForTimeout(300);

        const check = await page.evaluate((t) => {
          const island = document.getElementById("island");
          const activeView = document.querySelector(`#views .view.${t}`) || document.querySelector("#views .view.on");
          const islandRect = island ? island.getBoundingClientRect() : null;

          const isClippedByViewport = islandRect ? islandRect.bottom > window.innerHeight : false;
          const isScrollable = activeView
            ? window.getComputedStyle(activeView).overflowY === "auto" || window.getComputedStyle(activeView).overflowY === "scroll"
            : false;
          const viewOpacity = activeView ? window.getComputedStyle(activeView).opacity : "0";

          return {
            tab: t,
            viewportW: window.innerWidth,
            viewportH: window.innerHeight,
            islandBottom: islandRect?.bottom,
            islandHeight: islandRect?.height,
            isClippedByViewport,
            isScrollable,
            viewOpacity,
            contentLength: activeView?.textContent?.length || 0,
          };
        }, tab);

        const ssFileName = `${res.w}x${res.h}_s${scale}_${tab}.png`;
        const ssPath = path.join(outDir, ssFileName);
        await page.screenshot({ path: ssPath });

        const pass = !check.isClippedByViewport && check.isScrollable && parseFloat(check.viewOpacity) >= 0.95 && check.contentLength > 20;
        if (!pass) {
          failures++;
          console.error(`Check failed for tab ${tab} at ${res.w}x${res.h} s${scale}:`, check);
        }

        results.push({
          resolution: `${res.w}x${res.h}`,
          scale,
          tab,
          pass,
          screenshot: ssFileName,
          check,
        });
      }

      await context.close();
    }
  }

  await browser.close();
  server.close();

  const reportPath = path.join(outDir, "verification_report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ total: results.length, failures, results }, null, 2), "utf8");
  console.log(`\nVerification finished: ${results.length - failures}/${results.length} checks PASSED (Failures: ${failures}).`);
});
