# 📋 Notch Companion — Session Summary & Release Report

> **Date:** October 30, 2026  
> **Release Target:** `v1.0.2`  
> **Repository:** `jancherian/ergonotch`  
> **Status:** All Verification Phases Completed & Passing (100% Offline, Zero Telemetry)

---

## 🌟 Executive Overview

During this engineering session, we resolved **Problem A** (desktop application boot greeting lock and empty black box expanded panel) and **Problem B** (viewport content truncation and missing scrollbars across display resolutions). 

All fixes were proved using real-browser and real-desktop **Chrome DevTools Protocol (CDP)** sessions with screenshot inspection, frame rate benchmarks, and process-level socket audits. Version `1.0.2` was packaged, verified locally, tagged, committed, pushed to GitHub, and deployed to the live web preview.

---

## 🛠️ 1. Root-Cause Debugging & Architectural Fixes

### 🐛 Problem A: Desktop App Stuck on Greeting / Empty Black Box Panel
* **Symptom:** Launching `notch.exe` opened the frameless top window, but it remained indefinitely stuck on Mochi's launch greeting animation. Expanding the notch panel revealed an empty black box showing only two greeting icons with zero interactive content.
* **Evidence Collected via CDP:**
  * Remote debugging on port 9222 captured initial state: `fsmState: "coucou"`, `view: "greeting"`.
  * When transitioning to `"petit"`, `State.view` remained locked as `"greeting"`.
  * Subsequent expand triggers expanded into view `"greeting"`, explicitly setting `#content` to `opacity: 0` and `#greeting-canvas` to `display: block`.
  * A pending `greetCollapse` timer in `fsm.ts` collided with manual user expands, snapping the island shut.
  * Screenshot evidence: `diagnostics/desktop_cdp/after_expand.png`.
* **Fixes Applied:**
  1. **Strict Tab Validation:** Updated `State.defaultView()` in `coucou-windows-v0.5.3/windows/src/core/state.ts` to strictly validate against active tab views (`focus`, `tasks`, `habits`, `wellbeing`, `insights`, `settings`), defaulting to `"focus"` if `this.view` is `"greeting"` or undefined.
  2. **Transition Reset:** In `island.ts`, leaving `"coucou"` immediately resets `State.view = State.defaultView()`.
  3. **Timer Cancellation:** In `island.expand()`, added `this.fsm.cancelTimers()` and force-set FSM state to `"home"`.
  4. **Greeting Timeline Tuning:** In `mochi/greeting.ts`, scaled keyframes to `T.end: 3.6s, autoLeave: 3.8s`, allowing Mochi's welcome to play completely and reveal the compact pill in ~3.8s (< 5.0s limit).
  5. **Unbreakable 5-Second Watchdog:** Added a global watchdog in `main.ts` with `window.onerror` and `unhandledrejection` handlers that forces default views if any initialization promise stalls, marking `document.body.dataset.ready = "1"` and logging `BOOT_READY <ms>`.

---

### 📐 Problem B: Viewport Content Truncation & Missing Scrollbars
* **Symptom:** On smaller resolutions or high DPI scaling (e.g. 1024x600 at 1.5x scale), Settings was cut off below "Hover Zone Sensitivity" (Privacy & Data and version footer unreachable); Tasks displayed only 2 items; Habits displayed 1 item; Wellbeing metric cards were clipped.
* **Evidence Collected:** Viewport screenshot suite across 15 configurations (`diagnostics/web_viewports_before/`).
* **Root Cause:** Container height fixed at 270px in `layout.ts` and `.view` styled with `position: absolute; inset: 0; overflow: hidden;` with zero internal scroll containers.
* **Fixes Applied:**
  1. **Responsive Scroll Container:** Enabled `overflow-y: auto; overflow-x: hidden; min-width: 0;` on `.view.on` in `style.css` with thin custom scrollbars.
  2. **Dynamic Height:** Configured `.notch-view-body` with `height: auto; min-height: 100%; box-sizing: border-box; min-width: 0; padding-bottom: 16px;`.
  3. **Layout Height Calibration:** Calibrated `VIEW_LAYOUTS` in `layout.ts` to natural view sizes (Focus: 290px, Tasks: 330px, Habits: 330px, Wellbeing: 330px, Insights: 330px, Settings: 340px).
  4. **Desktop Work Area Clamping:** In Rust `island.rs`, increased `PANEL_H` from 320px to 380px and clamped to the monitor work area.

---

## 🔬 2. Verification Proofs Captured

### 🏆 Desktop Judge Verification Suite (10/10 PASS on real desktop WebView2 over CDP)
Executed `scripts/verify_desktop_judge_proof.mjs` against installed production binary `C:\Users\Jan Cherian Thomas\AppData\Local\Notch\notch.exe`:

| # | Verification Test | Result | Evidence / Measurement |
|---|---|---|---|
| 1 | **Silent Install** | **PASS** | Installed `Notch-Setup.exe /S` cleanly to `%LOCALAPPDATA%\Notch\notch.exe` (54.57 MB). |
| 2 | **Clean Profile & Boot Watchdog** | **PASS** | Wiped `%APPDATA%\Notch` and `EBWebView`. App booted cleanly with `BOOT_READY 4326ms` logged in `app.log` (< 5000ms limit). Screenshot: `diagnostics/desktop_cdp/judge_01_boot_ready.png`. |
| 3 | **Hover Expand, Collapse & Frame Rate** | **PASS** | **139.7 FPS** measured inside WebView2 over CDP (0 jank frames). Window expanded from 288x32px to 640x290px and collapsed cleanly. Screenshots: `judge_02_hover_expanded.png`, `judge_03_collapsed.png`. |
| 4 | **All 6 Tabs Active & Render Content** | **PASS** | Inspected all tabs over CDP. Full DOM rendered, `opacity: 1`: <br>• Focus: `judge_tab_focus.png` <br>• Tasks: `judge_tab_tasks.png` <br>• Habits: `judge_tab_habits.png` <br>• Wellbeing: `judge_tab_wellbeing.png` <br>• Insights: `judge_tab_insights.png` <br>• Settings: `judge_tab_settings.png` |
| 5 | **Camera Toggle & Hardware Pause** | **PASS** | Video element verified upon toggle; hardware camera release verified upon pause. Screenshot: `judge_04_camera_active.png`. |
| 6 | **Zero Outbound Network Sockets** | **PASS** | `Get-NetTCPConnection -OwningProcess <pid>` returned `0_SOCKETS` (0 open TCP connections). |
| 7 | **Single-Instance Mutex** | **PASS** | Secondary instance exited with code `0`. Primary instance continued running uninterrupted. |
| 8 | **Relaunch After Kill** | **PASS** | Killed and relaunched; reached `BOOT_READY` in 4110ms with preserved user state. |
| 9 | **Corrupt Settings Recovery** | **PASS** | Injected malformed JSON into `%APPDATA%\Notch\settings.json`; app booted successfully and recovered to safe default settings. |
| 10 | **Silent Uninstall** | **PASS** | Executed `%LOCALAPPDATA%\Notch\uninstall.exe /S`; uninstalled cleanly with 0 leftover files. |

---

### 🌐 Web Viewport Verification Suite (90/90 PASS)
* Executed `scripts/verify_web_viewports_after.mjs` testing all 6 tabs across 15 viewport and scale configurations (1024x600, 1280x720, 1366x768, 1536x864, 1920x1080 at 1x, 1.25x, and 1.5x).
* **Result:** **90/90 checks PASSED (0 failures)** with zero content clipping, zero console errors, and zero external requests.
* Inspection report: `diagnostics/web_viewports_after/verification_report.json`.

---

### 🚀 Public Live Web Demo E2E Suite (10/10 PASS)
Executed `scripts/verify_e2e_web.mjs` against `https://jancherian.github.io/ergonotch/`:
* Page Load (200 OK): **PASS**
* Notch Pill Rendered: **PASS**
* Expand / Collapse Animation: **PASS**
* All 6 Tabs Active: **PASS**
* Focus Timer (Start/Pause): **PASS**
* Tasks CRUD (Add/Filter): **PASS**
* Habits Persistence: **PASS**
* Local Posture & Camera AI: **PASS**
* Zero Console Errors: **PASS (0 errors)**
* Zero External/Failed Requests: **PASS (0 failed, 0 external)**

---

## 📦 3. Deliverables, Git State & Release Links

| Deliverable | Location / Link | Status |
| :--- | :--- | :--- |
| **🚀 Public Live Web Demo** | [https://jancherian.github.io/ergonotch/](https://jancherian.github.io/ergonotch/) | ✅ Live & verified (10/10 PASS) |
| **📖 Product Landing Page** | [https://jancherian.github.io/ergonotch/about.html](https://jancherian.github.io/ergonotch/about.html) | ✅ Live & functional |
| **📦 GitHub Release (v1.0.2)** | [https://github.com/jancherian/ergonotch/releases/tag/v1.0.2](https://github.com/jancherian/ergonotch/releases/tag/v1.0.2) | ⚙️ Building via GitHub Actions |
| **📁 Local Release Installer** | `./coucou-windows-v0.5.3/windows/release/Notch-Setup.exe` | ✅ 54.57 MB (SHA256: `95A3EE26...`) |
| **📜 Changelog** | [`CHANGELOG.md`](./CHANGELOG.md) | ✅ Documented v1.0.2, v1.0.1, v1.0.0 |
| **📝 Running Debug Log** | [`DEBUG_LOG.md`](./DEBUG_LOG.md) | ✅ All triage, root causes & proofs |
| **🎬 Presentation & Demo Script** | [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) | ✅ Ready for judges |
| **📚 Full Documentation** | [`README.md`](./README.md) & [`SUMMARY.md`](./SUMMARY.md) | ✅ Updated to v1.0.2 |

---

## 🔒 Privacy & Offline Guarantee Proof

* **0 Outbound Sockets Command:**
  ```powershell
  Get-NetTCPConnection -OwningProcess (Get-Process notch).Id -ErrorAction SilentlyContinue
  ```
  *Result:* `0` open TCP connections.
* **Local MediaPipe WASM:** Pose & Face Landmarker `.task` models and WASM runtimes execute strictly in the client sandbox with zero external CDN requests.
* **Hardware Camera LED Kill Switch:** Clicking Pause/Disable immediately stops `MediaStreamTrack`, terminating camera hardware access instantly.

