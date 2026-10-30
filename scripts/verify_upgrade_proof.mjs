import { chromium } from "playwright";
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.resolve(repoRoot, "diagnostics/upgrade_proof");
const backupInstaller = "C:\\Users\\Jan Cherian Thomas\\backup\\Notch-Setup-v1.0.2-known-good.exe";
const newInstaller = path.resolve(repoRoot, "coucou-windows-v0.5.3/windows/release/Notch-Setup.exe");
const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, "AppData", "Local");
const installedExe = path.join(localAppData, "Notch", "notch.exe");

fs.mkdirSync(outDir, { recursive: true });

function log(msg) {
  console.log(`[UPGRADE-PROOF] ${msg}`);
}

function runPwsh(cmd) {
  const res = spawnSync("powershell.exe", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
  if (res.error) throw res.error;
  return res.stdout || "";
}

function killNotch() {
  runPwsh(`
    Get-Process notch, coucou -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'Notch|ergonotch' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  `);
}

async function waitForCdp(port = 9222, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function launchNotchDetached() {
  runPwsh(`
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
    Start-Process -FilePath "${installedExe}"
  `);
}

async function findMainPage(browser, maxWaitMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const page = browser.contexts()[0]?.pages().find((p) => p.url().includes("tauri.localhost"));
    if (page) return page;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Could not find tauri.localhost page over CDP");
}

async function run() {
  log("Step 1: Installing known-good v1.0.2 baseline...");
  killNotch();
  runPwsh(`Start-Process -FilePath "${backupInstaller}" -ArgumentList "/S" -Wait`);
  await new Promise((r) => setTimeout(r, 3000));

  log("Step 2: Launching v1.0.2 to insert test task and habit...");
  launchNotchDetached();

  const cdpReady = await waitForCdp(9222);
  if (!cdpReady) throw new Error("CDP failed to start on v1.0.2");

  const browser1 = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const islandPage1 = await findMainPage(browser1);

  await islandPage1.waitForFunction(() => document.body.dataset.ready === "1", { timeout: 10000 });

  // Add a task and a habit via localStorage
  await islandPage1.evaluate(() => {
    // Inject test task
    const tasks = JSON.parse(localStorage.getItem("notch_tasks") || "[]");
    tasks.unshift({
      id: "upgrade-test-task-1",
      title: "Task Preserved Across v1.0.3 Upgrade",
      completed: false,
      priority: "high",
      createdAt: Date.now(),
    });
    localStorage.setItem("notch_tasks", JSON.stringify(tasks));

    // Inject test habit
    const habits = JSON.parse(localStorage.getItem("notch_habits") || "[]");
    habits.unshift({
      id: "upgrade-test-habit-1",
      name: "Habit Preserved Across Upgrade",
      streak: 5,
      completedToday: true,
      history: [1, 1, 1, 1, 1, 0, 0],
    });
    localStorage.setItem("notch_habits", JSON.stringify(habits));
  });

  log("Test task & habit written to v1.0.2. Taking screenshot...");
  await islandPage1.screenshot({ path: path.join(outDir, "01_v1.0.2_data_written.png") });
  await browser1.close();
  killNotch();
  await new Promise((r) => setTimeout(r, 2000));

  log("Step 3: Installing v1.0.3 over existing installation...");
  runPwsh(`Start-Process -FilePath "${newInstaller}" -ArgumentList "/S" -Wait`);
  await new Promise((r) => setTimeout(r, 2000));

  log("Step 4: Launching v1.0.3 to verify data persistence...");
  launchNotchDetached();

  const cdpReady2 = await waitForCdp(9222);
  if (!cdpReady2) throw new Error("CDP failed to start on v1.0.3");

  const browser2 = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const islandPage2 = await findMainPage(browser2);

  await islandPage2.waitForFunction(() => document.body.dataset.ready === "1", { timeout: 10000 });

  const data = await islandPage2.evaluate(() => {
    const tasks = JSON.parse(localStorage.getItem("notch_tasks") || "[]");
    const habits = JSON.parse(localStorage.getItem("notch_habits") || "[]");
    return {
      hasTask: tasks.some((t) => t.id === "upgrade-test-task-1"),
      taskTitle: tasks.find((t) => t.id === "upgrade-test-task-1")?.title,
      hasHabit: habits.some((h) => h.id === "upgrade-test-habit-1"),
      habitName: habits.find((h) => h.id === "upgrade-test-habit-1")?.name,
    };
  });

  log(`Data persistence check: ${JSON.stringify(data)}`);
  if (!data.hasTask || !data.hasHabit) {
    throw new Error(`Data persistence FAILED: ${JSON.stringify(data)}`);
  }

  // Switch to tasks tab and take screenshot
  await islandPage2.evaluate(() => {
    const btn = document.querySelector('[data-view="tasks"]');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await islandPage2.screenshot({ path: path.join(outDir, "02_v1.0.3_tasks_persisted.png") });

  // Switch to habits tab and take screenshot
  await islandPage2.evaluate(() => {
    const btn = document.querySelector('[data-view="habits"]');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await islandPage2.screenshot({ path: path.join(outDir, "03_v1.0.3_habits_persisted.png") });

  await browser2.close();
  killNotch();

  log("PASS: Upgrade proof completely successful! User data persisted seamlessly.");
}

run().catch((err) => {
  console.error("[UPGRADE-PROOF] FAILED:", err);
  process.exit(1);
});
