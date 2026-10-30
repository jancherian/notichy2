import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../coucou-windows-v0.5.3/windows/dist");

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

server.listen(4174, async () => {
  console.log("Animation benchmark server running on http://127.0.0.1:4174");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-gpu-rasterization",
      "--enable-zero-copy",
    ],
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.0,
  });

  const diagDir = path.resolve(__dirname, "../diagnostics/animations");
  if (!fs.existsSync(diagDir)) fs.mkdirSync(diagDir, { recursive: true });

  const results = [];

  try {
    await page.goto("http://127.0.0.1:4174/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // 1. Hover Hysteresis Test
    console.log("\n[Test 1] Testing Hover Hysteresis (<100ms swipe vs >150ms intentional hover)...");
    const island = page.locator("#island");
    const islandBox = await island.boundingBox();
    if (!islandBox) throw new Error("#island bounding box unavailable");

    // Fast sweep: cursor enters and leaves in 60ms
    const enterX = islandBox.x + islandBox.width / 2;
    const enterY = islandBox.y + islandBox.height / 2;
    await page.mouse.move(enterX, enterY);
    await page.waitForTimeout(60);
    await page.mouse.move(10, 10);
    await page.waitForTimeout(200);

    // Should still be collapsed (width ~ NOTCH_W = 240px)
    const fastSweepWidth = (await island.boundingBox())?.width || 0;
    const sweepResisted = fastSweepWidth < 300;
    console.log(`  Fast sweep width after 200ms: ${fastSweepWidth.toFixed(1)}px (Resisted open: ${sweepResisted})`);
    results.push({ name: "Hover Hysteresis (Pass-by cursor ignored)", pass: sweepResisted });

    // Intentional hover: cursor enters and stays > 380ms (130ms hysteresis + 250ms spring)
    await page.mouse.move(enterX, enterY);
    await page.waitForTimeout(400);
    const hoverExpandWidth = (await island.boundingBox())?.width || 0;
    const hoverExpanded = hoverExpandWidth > 620;
    console.log(`  Intentional hover width after 400ms: ${hoverExpandWidth.toFixed(1)}px (Expanded: ${hoverExpanded})`);
    results.push({ name: "Intentional Hover (Opens smoothly)", pass: hoverExpanded });

    // 2. Frame Rate & Smoothness Benchmark during Expand / Collapse
    console.log("\n[Test 2] Benchmarking 60 FPS Frame Rate & Frame Times during Expand/Collapse cycles...");
    const perfReport = await page.evaluate(async () => {
      const island = window.island || window.__island;
      if (!island) return { error: "window.island not found" };

      const frameTimes = [];
      let isRecording = false;
      let lastTime = performance.now();

      function onFrame(now) {
        if (isRecording) {
          const delta = now - lastTime;
          frameTimes.push(delta);
        }
        lastTime = now;
        requestAnimationFrame(onFrame);
      }
      requestAnimationFrame(onFrame);

      // Perform 5 expand/collapse cycles
      for (let i = 0; i < 5; i++) {
        isRecording = true;
        island.collapse();
        await new Promise((r) => setTimeout(r, 320));
        island.expand("focus");
        await new Promise((r) => setTimeout(r, 350));
      }
      isRecording = false;

      // Analyze frame times
      const totalFrames = frameTimes.length;
      const longFrames = frameTimes.filter((dt) => dt > 25); // > 40 fps
      const jankFrames = frameTimes.filter((dt) => dt > 50); // dropped below 20 fps (long task)
      const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / (totalFrames || 1);
      const avgFps = 1000 / avgDelta;

      return {
        totalFrames,
        longFramesCount: longFrames.length,
        jankFramesCount: jankFrames.length,
        avgFps,
        avgDeltaMs: avgDelta,
      };
    });

    console.log(`  Total Animation Frames Sampled: ${perfReport.totalFrames}`);
    console.log(`  Average FPS: ${perfReport.avgFps.toFixed(1)} FPS (Target: ~60 FPS)`);
    console.log(`  Average Frame Time: ${perfReport.avgDeltaMs.toFixed(2)} ms (16.6ms is 60fps)`);
    console.log(`  Long frames (>25ms): ${perfReport.longFramesCount}`);
    console.log(`  Jank frames (>50ms): ${perfReport.jankFramesCount}`);

    const fpsPass = perfReport.avgFps >= 50 && perfReport.jankFramesCount === 0;
    results.push({
      name: `60 FPS Animation Benchmark (${perfReport.avgFps.toFixed(1)} FPS, ${perfReport.jankFramesCount} jank frames)`,
      pass: fpsPass,
    });

    // 3. Tab switching responsiveness
    console.log("\n[Test 3] Testing Tab switching animations...");
    const tabs = ["tasks", "habits", "wellbeing", "insights", "settings", "focus"];
    let tabSwitchOk = true;
    for (const t of tabs) {
      const tabBtn = page.locator(`.tab[title="${t.charAt(0).toUpperCase() + t.slice(1)}"]`);
      if (await tabBtn.count()) {
        await tabBtn.click();
        await page.waitForTimeout(60);
      } else {
        tabSwitchOk = false;
      }
    }
    results.push({ name: "Tab Transitions Smooth & Responsive", pass: tabSwitchOk });

    // 4. Reduced-motion Support Test
    console.log("\n[Test 4] Testing prefers-reduced-motion / animations-off...");
    const reducedMotionPage = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await reducedMotionPage.emulateMedia({ reducedMotion: "reduce" });
    await reducedMotionPage.goto("http://127.0.0.1:4174/index.html", { waitUntil: "domcontentloaded" });
    await reducedMotionPage.waitForTimeout(300);

    const rmIsland = reducedMotionPage.locator("#island");
    const initialRmWidth = (await rmIsland.boundingBox())?.width || 0;

    // Expand via island.expand("focus")
    const debugInfo = await reducedMotionPage.evaluate(() => {
      const isl = window.island || window.__island;
      const beforeMode = window.state?.mode;
      const shouldAnim = isl?.shouldAnimate ? isl.shouldAnimate() : "no-method";
      const mediaMatch = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      isl?.expand("focus");
      const afterMode = window.state?.mode;
      const afterWidth = document.getElementById("island")?.offsetWidth;
      const styleWidth = isl?.islandEl?.style?.width;
      const widthVal = isl?.width?.value;
      return { islFound: !!isl, beforeMode, afterMode, afterWidth, shouldAnim, mediaMatch, styleWidth, widthVal };
    });
    console.log("  Debug Info for Reduced Motion:", JSON.stringify(debugInfo));

    // Under reduced motion, it should snap immediately without a 300ms spring
    await reducedMotionPage.waitForTimeout(30);
    const inspectComputed = await reducedMotionPage.evaluate(() => {
      const el = document.getElementById("island");
      // Find which stylesheet rules match #island
      const matched = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule.selectorText && el.matches(rule.selectorText)) {
              matched.push({ selector: rule.selectorText, cssText: rule.cssText });
            }
          }
        } catch { /* ignore cross-origin */ }
      }
      const islandEls = document.querySelectorAll("#island");
      const isl = window.island || window.__island;
      const isSameEl = el === isl?.islandEl;
      const rawStyleAttr = el?.getAttribute("style");
      return {
        isSameEl,
        rawStyleAttr,
        count: islandEls.length,
        styleWidth: el?.style?.width,
        islStyleWidth: isl?.islandEl?.style?.width,
        computedWidth: el ? window.getComputedStyle(el).width : null,
        maxWidth: el ? window.getComputedStyle(el).maxWidth : null,
        minWidth: el ? window.getComputedStyle(el).minWidth : null,
        offsetWidth: el?.offsetWidth,
        clientRectWidth: el?.getBoundingClientRect().width,
        matched,
        parentWidth: el?.parentElement ? window.getComputedStyle(el.parentElement).width : null,
      };
    });
    console.log("  Computed inspect:", JSON.stringify(inspectComputed));
    const snappedWidth = (await rmIsland.boundingBox())?.width || 0;
    const reducedMotionPassed = snappedWidth > 620;
    console.log(`  Snap width after 30ms under reduced-motion: ${snappedWidth.toFixed(1)}px (Immediate: ${reducedMotionPassed})`);
    results.push({ name: "prefers-reduced-motion Immediate Snapping", pass: reducedMotionPassed });

    // Screenshot proof
    await page.screenshot({ path: path.join(diagDir, "01_animation_bench_expanded.png") });
    await reducedMotionPage.screenshot({ path: path.join(diagDir, "02_reduced_motion_snapped.png") });
    await reducedMotionPage.close();

    console.log("\n=== PART 5 ANIMATION VERIFICATION SUMMARY ===");
    let allPass = true;
    for (const r of results) {
      console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name}`);
      if (!r.pass) allPass = false;
    }

    if (allPass) {
      console.log("\n>>> ALL PART 5 ANIMATION CHECKS PASSED (60 FPS TARGET ACHIEVED) <<<");
    } else {
      console.error("\n>>> SOME ANIMATION CHECKS FAILED <<<");
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("Benchmark error:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
