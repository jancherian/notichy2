import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../diagnostics/desktop_cdp");

async function main() {
  console.log("Connecting over CDP to http://localhost:9222 ...");
  let browser;
  try {
    browser = await chromium.connectOverCDP("http://localhost:9222");
  } catch (err) {
    console.error("Failed to connect over CDP to port 9222:", err.message);
    process.exit(1);
  }

  const contexts = browser.contexts();
  console.log(`Found ${contexts.length} browser contexts.`);

  const allPages = [];
  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      allPages.push(page);
    }
  }

  console.log(`Found ${allPages.length} pages/windows.`);

  const report = [];

  for (let i = 0; i < allPages.length; i++) {
    const page = allPages[i];
    const url = page.url();
    const title = await page.title().catch(() => "unknown");
    console.log(`\n--- Page [${i}]: title="${title}", url="${url}" ---`);

    const consoleLogs = [];
    const pageErrors = [];
    const failedRequests = [];

    page.on("console", (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message || String(err));
    });
    page.on("requestfailed", (req) => {
      failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
    });

    // Wait a brief moment to gather initial state
    await page.waitForTimeout(1000);

    const safeTitle = (title || "page").replace(/[^a-zA-Z0-9_-]/g, "_");
    const screenshotPath = path.join(outDir, `page_${i}_${safeTitle}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch((err) => {
      console.warn(`Could not screenshot page ${i}: ${err.message}`);
    });
    console.log(`Screenshot saved to: ${screenshotPath}`);

    const domInfo = await page.evaluate(() => {
      const root = document.getElementById("root");
      const island = document.getElementById("island");
      const views = document.getElementById("views");
      const greetingCanvas = document.getElementById("greeting-canvas");
      const tabs = Array.from(document.querySelectorAll(".tab")).map((t) => ({
        id: t.id,
        text: t.textContent?.trim(),
        active: t.classList.contains("active"),
      }));
      const renderedViews = Array.from(document.querySelectorAll("#views .view")).map((v) => ({
        id: v.id,
        className: v.className,
        visible: window.getComputedStyle(v).display !== "none" && window.getComputedStyle(v).opacity !== "0",
        childCount: v.children.length,
        htmlSnippet: v.innerHTML.slice(0, 200),
      }));

      return {
        bodyReady: document.body.dataset.ready,
        bodyClasses: document.body.className,
        rootExists: !!root,
        islandExists: !!island,
        islandClass: island ? island.className : null,
        islandStyle: island ? island.getAttribute("style") : null,
        greetingCanvasExists: !!greetingCanvas,
        greetingCanvasStyle: greetingCanvas ? greetingCanvas.getAttribute("style") : null,
        greetingCanvasDisplay: greetingCanvas ? window.getComputedStyle(greetingCanvas).display : null,
        viewsExists: !!views,
        viewsChildCount: views ? views.children.length : 0,
        tabs,
        renderedViews,
        state: window.state ? {
          mode: window.state.mode,
          view: window.state.view,
          isGeometryAnimating: window.state.isGeometryAnimating,
          settings: window.state.settings,
        } : null,
        fsmState: window.island?.fsm ? {
          state: window.island.fsm.state,
          pinned: window.island.fsm.pinned,
        } : null,
        documentHtmlSnippet: document.body.innerHTML.slice(0, 500),
      };
    }).catch((err) => ({ error: err.message }));

    report.push({
      index: i,
      title,
      url,
      screenshot: screenshotPath,
      domInfo,
      consoleLogs,
      pageErrors,
      failedRequests,
    });
  }

  const reportPath = path.join(outDir, "reproduce_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nReport written to: ${reportPath}`);
  console.log("DOM and State Details:");
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
