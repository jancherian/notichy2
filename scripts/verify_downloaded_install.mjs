import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runPwsh(cmd) {
  return spawnSync("powershell.exe", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
}

function killAllNotch() {
  runPwsh(`
    Get-Process notch, coucou -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'Notch|ergonotch' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  `);
}

async function main() {
  console.log("Testing downloaded release installer...");
  const localAppData = process.env.LOCALAPPDATA;
  const installedExe = path.join(localAppData, "Notch", "notch.exe");
  const downloadedInstaller = path.resolve("diagnostics/downloaded_release/Notch-Setup.exe");

  killAllNotch();
  await new Promise(r => setTimeout(r, 1500));

  console.log("Installing downloaded release installer silently (/S)...");
  runPwsh(`Start-Process -FilePath "${downloadedInstaller}" -ArgumentList "/S" -Wait`);
  await new Promise(r => setTimeout(r, 2000));

  if (!fs.existsSync(installedExe)) {
    throw new Error(`notch.exe not found at ${installedExe} after installation!`);
  }
  console.log("Installed notch.exe verified on disk.");

  console.log("Launching installed notch.exe detached with CDP...");
  runPwsh(`
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
    Start-Process -FilePath "${installedExe}"
  `);

  let browser;
  for (let i = 0; i < 30; i++) {
    try {
      browser = await chromium.connectOverCDP("http://localhost:9222");
      break;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!browser) throw new Error("Failed to connect to CDP on port 9222");
  console.log("Connected to desktop WebView2 over CDP!");

  const pages = browser.contexts()[0].pages();
  const page = pages.find(p => p.url().includes("index.html")) || pages[0];
  console.log("Found primary window:", page.url());

  // Wait for BOOT_READY
  await page.waitForFunction(() => document.body.dataset.ready === "1", { timeout: 10000 });
  const isReady = await page.evaluate(() => document.body.dataset.ready);
  console.log("PASS: document.body.dataset.ready =", isReady);

  // Take screenshot
  fs.mkdirSync("diagnostics/downloaded_release", { recursive: true });
  const screenshotPath = "diagnostics/downloaded_release/downloaded_installed_boot.png";
  await page.screenshot({ path: screenshotPath });
  console.log("PASS: Screenshot saved to", screenshotPath);

  await browser.close();
  killAllNotch();
  console.log("=== ALL DOWNLOADED INSTALLER VERIFICATION CHECKS PASSED! ===");
}

main().catch(err => {
  console.error("FAIL:", err);
  process.exit(1);
});
