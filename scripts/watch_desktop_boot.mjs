import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../diagnostics/desktop_cdp");

async function main() {
  console.log("Connecting over CDP to http://localhost:9222 ...");
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const contexts = browser.contexts();
  let mainPage = null;

  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      if (page.url() === "http://tauri.localhost/") {
        mainPage = page;
        break;
      }
    }
  }

  if (!mainPage) {
    console.error("Main page http://tauri.localhost/ not found!");
    process.exit(1);
  }

  console.log("Watching main island window over 10 seconds...");

  for (let s = 1; s <= 10; s++) {
    await mainPage.waitForTimeout(1000);
    const info = await mainPage.evaluate(() => {
      const gCanvas = document.getElementById("greeting-canvas");
      const views = document.getElementById("views");
      const activeTab = document.querySelector(".tab.active")?.textContent?.trim();
      const visibleView = document.querySelector("#views .view.on")?.className;
      return {
        fsmState: window.island?.fsm?.state,
        mode: window.state?.mode,
        view: window.state?.view,
        isGeometryAnimating: window.state?.isGeometryAnimating,
        greetingDisplay: gCanvas ? window.getComputedStyle(gCanvas).display : null,
        activeTab: activeTab || null,
        visibleView: visibleView || null,
        islandWidth: document.getElementById("island")?.offsetWidth,
        islandHeight: document.getElementById("island")?.offsetHeight,
      };
    });
    console.log(`t=${s}s:`, JSON.stringify(info));

    if (s === 2 || s === 6 || s === 8 || s === 10) {
      const ssPath = path.join(outDir, `timeline_${s}s.png`);
      await mainPage.screenshot({ path: ssPath });
      console.log(`Saved screenshot at t=${s}s: ${ssPath}`);
    }
  }

  // Now simulate hover or click to see if views open or if it stays a black box!
  console.log("\nAttempting to expand to defaultView via island.expand()...");
  const expandResult = await mainPage.evaluate(() => {
    try {
      window.island.expand(window.state.defaultView());
      return { success: true, mode: window.state.mode, view: window.state.view };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  console.log("expandResult:", expandResult);
  await mainPage.waitForTimeout(500);

  const afterExpandSs = path.join(outDir, `after_expand.png`);
  await mainPage.screenshot({ path: afterExpandSs });
  console.log(`Saved after_expand screenshot: ${afterExpandSs}`);

  const afterExpandInfo = await mainPage.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(".tab")).map((t) => ({
      text: t.textContent?.trim(),
      active: t.classList.contains("active"),
    }));
    const views = Array.from(document.querySelectorAll("#views .view")).map((v) => ({
      className: v.className,
      display: window.getComputedStyle(v).display,
      opacity: window.getComputedStyle(v).opacity,
      childCount: v.children.length,
      height: v.offsetHeight,
      width: v.offsetWidth,
      contentPreview: v.textContent?.slice(0, 100),
    }));
    return { tabs, views };
  });
  console.log("afterExpandInfo:", JSON.stringify(afterExpandInfo, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

