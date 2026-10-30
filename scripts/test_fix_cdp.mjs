import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../diagnostics/desktop_cdp");

async function main() {
  console.log("Connecting over CDP to http://localhost:9222 ...");
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const mainPage = browser.contexts()[0].pages().find((p) => p.url() === "http://tauri.localhost/");
  if (!mainPage) throw new Error("Main page not found");

  const before = await mainPage.evaluate(() => ({
    mode: window.state.mode,
    view: window.state.view,
    defaultView: window.state.defaultView(),
    contentOpacity: window.getComputedStyle(document.getElementById("content")).opacity,
    activeTab: document.querySelector(".tab.on, .tab.active")?.textContent?.trim(),
  }));
  console.log("Before fix test:", before);

  // Apply fix in memory
  await mainPage.evaluate(() => {
    window.state.view = "focus";
    window.island.expand("focus");
  });
  await mainPage.waitForTimeout(600);

  const after = await mainPage.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(".tab")).map((t) => ({
      text: t.textContent?.trim(),
      active: t.classList.contains("on") || t.classList.contains("active"),
    }));
    const activeView = document.querySelector("#views .view.on");
    return {
      mode: window.state.mode,
      view: window.state.view,
      contentOpacity: window.getComputedStyle(document.getElementById("content")).opacity,
      activeTab: tabs.find((t) => t.active)?.text,
      activeViewSnippet: activeView?.textContent?.slice(0, 150),
      activeViewClass: activeView?.className,
      activeViewHeight: activeView?.offsetHeight,
      activeViewVisible: activeView ? window.getComputedStyle(activeView).opacity !== "0" : false,
      islandHeight: document.getElementById("island").offsetHeight,
      islandWidth: document.getElementById("island").offsetWidth,
    };
  });
  console.log("After fix test:", after);

  const ssPath = path.join(outDir, "test_focus_expanded.png");
  await mainPage.screenshot({ path: ssPath });
  console.log("Screenshot saved:", ssPath);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

