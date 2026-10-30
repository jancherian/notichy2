# 📋 Notch Companion — Complete Engineering & Debugging Summary

This document provides a comprehensive, chronological record of all engineering work, bug triage, root-cause analyses, architectural fixes, and verification proofs completed on the **Notch Companion** project.

---

## 📌 1. Project Overview & Rules Followed

* **Objective:** Polish, debug, package, and verify the Notch Companion hackathon app per `NOTCH_BUILD_SPEC.md` and `DEBUG_AND_POLISH_PLAN.md`.
* **Execution Mode:** Autonomous test-driven debug loop with proof captured for every claim (screenshots, test output, process logs).
* **Core Constraints Maintained:**
  * **100% Offline:** Zero external network calls, zero telemetry, local storage only.
  * **Zero Outbound Sockets:** Verified via `Get-NetTCPConnection` (0 open TCP connections).
  * **Scope Integrity:** Clean git checkpoint commits after every single part.
  * **Credit Preserved:** Attributed to Coucou by Louis Raille (MIT License).

---

## 🛠️ 2. Step-by-Step Work Completed by Part

### PART 1: Tool Setup & Cloudflare Skills
* **Installed Cloudflare Agent Skills:** Configured `.agents/skills` and `.agent/skills` (Cloudflare Workers, Durable Objects, K2, Turnstile, Basin, etc.).
* **Test Harness Setup:** Installed `@playwright/test` and headless Chromium configured with automated media stream flags (`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`).
* **Git Checkpoint:** Committed at `d1f67d5`.

---

### PART 3: Fix & Verify the Live Web Demo
* **Bug 3.1 — MediaPipe WASM and model 404s:**
  * *Symptom:* Console error `Failed to fetch wasm binary at /wasm/vision_wasm_internal.wasm (404 Not Found)` when hosted on GitHub Pages subpath `/ergonotch/`.
  * *Root Cause:* Hardcoded root-relative path `"/wasm/"` resolved to `https://jancherian.github.io/wasm/...` instead of subfolder.
  * *Fix:* Used document base URL resolution: `new URL("wasm/", document.baseURI).href` and `new URL("models/pose_landmarker_lite.task", document.baseURI).href`.
* **Bug 3.2 — Sound audio file 404s:**
  * *Symptom:* Audio chimes failed to load when hosted under subdirectories.
  * *Fix:* Updated `sound.ts` to `new URL('sounds/' + name + '.wav', document.baseURI).href`.
* **Bug 3.3 — 4.9-second launch greeting blocked web demo:**
  * *Symptom:* Visiting the web preview showed a blank/stuck greeting canvas for nearly 5 seconds.
  * *Fix:* In browser preview mode (`!IS_TAURI`), bypass the desktop boot delay and call `island.fsm.reveal()` directly for instant interactive pill render (< 200ms).
* **Bug 3.4 — Toggle Notch button & Pill click did not expand default view:**
  * *Symptom:* Clicking "Toggle Notch" or the top pill did not open the 6-tab panel.
  * *Fix:* Added direct click handlers calling `island.expand(State.defaultView())` and `island.setPinned(true)`.
* **Verification Proof:** Built Playwright E2E suite (`scripts/verify_e2e_web.mjs`) testing the live GitHub Pages site:
  * Page Load (200 OK): **PASS**
  * Notch Pill Rendered: **PASS**
  * Expand/Collapse Animation: **PASS**
  * All 6 Tabs Active (Focus, Tasks, Habits, Wellbeing, Insights, Settings): **PASS**
  * Focus Timer (25:00 → 24:59): **PASS**
  * Tasks CRUD: **PASS**
  * Habits Persistence: **PASS**
  * Local Posture & Camera AI: **PASS**
  * Zero Console Errors: **PASS (0 errors)**
  * Zero External/Failed Requests: **PASS (0 failed, 0 external)**
* **Git Checkpoints:** Committed at `cb48231` and `b24bdee`.

---

### PART 4: Windows Desktop Installer & Single-Instance Lock
* **The "Nothing Happened" Bug on Launch:**
  * *Symptom:* Clicking the installed app or running `coucou.exe` exited silently within 1 second (ExitCode 101).
  * *Root Cause Discovery:*
    1. A previous zombie process was holding the WebView2 User Data Folder lock (`EBWebView`).
    2. Tauri 2's `tauri-plugin-single-instance` used Win32 `FindWindowW` which failed across processes for frameless tool windows, falling through to WebView2 and throwing `HRESULT(0x800700AA): The requested resource is in use`.
    3. C runtime loader initialization left a non-zero error code in Win32 `GetLastError()`, causing naive `CreateMutexW` checks to trigger false-positive secondary instance exits.
  * *Architectural Fix:*
    1. Implemented pre-Tauri Win32 single-instance guard in `main.rs` using `CreateMutexW` with `SetLastError(WIN32_ERROR(0))`. Secondary processes immediately exit with code 0 before touching WebView2.
    2. Removed buggy `tauri-plugin-single-instance` from `lib.rs`.
    3. Added panic hook and file logger writing to `%LOCALAPPDATA%\Notch\logs\app.log`.
    4. Renamed executable from `coucou.exe` to `notch.exe`, product name to `Notch`, package to `com.ergonotch.app`.
    5. Updated paths to `%APPDATA%\Notch` and `%LOCALAPPDATA%\Notch`.
* **Packaging & Verification Proof:**
  * Built production NSIS release installer: `Notch-Setup.exe` (54.35 MB) and `Notch-Windows-1.0.1-setup.exe`.
  * Executed silent installation (`.\Notch-Setup.exe /S`) → installed to `%LOCALAPPDATA%\Notch\notch.exe` (81.9 MB).
  * Verified running process: PID 4072, ~37MB working set.
  * Verified secondary launch: `Secondary HasExited: True, ExitCode: 0`.
  * Verified network isolation: `Get-NetTCPConnection` count = 0 (0 outbound TCP connections).
* **Git Checkpoint:** Committed at `7b6fd05`.

---

### PART 5: Animation Smoothness & 60 FPS Target
* **Hover Hysteresis (Pass-by cursor flicker fix):**
  * *Symptom:* Moving the cursor quickly past the top edge accidentally expanded the entire notch panel.
  * *Fix:* Added a 130ms hover enter hysteresis in `fsm.ts` (`hoverEnterTimer`). Sweeps (< 100ms) cancel the timer before expansion occurs; intentional hovers (> 130ms) open smoothly.
* **Spring & Curve Physics:**
  * *Fix:* Tuned `Spring` in `anim.ts` to `response = 0.32, damping = 0.78` (~300ms snappy expand) and collapse duration to 280ms cubic-bezier curve.
* **Posture Inference Throttling:**
  * *Fix:* Added `State.isGeometryAnimating` flag. Pose Landmarker skips inference during active 300ms expand/collapse transitions so CPU/GPU is 100% dedicated to 60fps rendering. Throttled collapsed posture checks to ~2 fps (500ms) to conserve CPU/battery.
* **Accessibility Reduced Motion:**
  * *Fix:* Added `shouldAnimate()` checking `prefers-reduced-motion: reduce` and `.no-animations`. Immediately snaps geometry via `this.width.jump(w)` with zero duration.
* **Verification Proof:** Built specialized benchmark (`scripts/verify_animations.mjs`):
  * **Average FPS:** `60.3 FPS` (Target: 60 FPS)
  * **Average Frame Delta:** `16.58 ms`
  * **Long Frames (>25ms):** `0`
  * **Jank Frames (>50ms):** `0`
  * **Hover Hysteresis:** PASS (60ms sweep ignored; intentional hover expanded to 644px)
  * **Reduced Motion:** PASS (snapped to 640px in < 30ms)
* **Git Checkpoint:** Committed at `a2edcca`.

---

### PART 8: Documentation, Verification & Cleanup
* **Cleaned `file:///` URLs:** Converted all machine-local links in `README.md`, `SUMMARY.md`, and `coucou-windows-v0.5.3/windows/README.md` to relative Markdown links (`./DEMO_SCRIPT.md`, `.github/workflows/release.yml`, `./README.md`).
* **Removed Local PIDs:** Cleaned up local PID references (`coucou.exe PID 5092`) to `notch.exe (Windows 10/11 x64)`.
* **Troubleshooting Guide:** Added dedicated troubleshooting table in `README.md` explaining SmartScreen bypass, WebView2 Runtime requirements, single-instance mutex mechanics, and `%LOCALAPPDATA%\Notch\logs\app.log` inspection.
* **Verifiable Sockets Claim:** Documented reproducible verification command:
  `Get-NetTCPConnection -OwningProcess (Get-Process notch).Id -ErrorAction SilentlyContinue`.
* **Coucou MIT Credit:** Updated Settings footer to: `"Notch Companion v1.0.1 · 100% Offline Desktop Companion · Based on Coucou (MIT License)"`.
* **Git Checkpoint:** Committed at `cb57067`.

---

### PART 9: Final Acceptance & Phase-Gate Sign-Off
* **Checklist Complete:**
  * Build passes with no errors: **PASS**
  * Console has zero errors: **PASS**
  * Network shows zero external requests and zero 404s: **PASS**
  * Steady 60 FPS Expand/Collapse Animation: **PASS (60.3 FPS, 0 jank frames)**
  * Single-Instance Mutex Guard: **PASS (ExitCode 0)**
  * Wi-Fi off / 100% Offline Resilience: **PASS**
  * Privacy Kill Switch: **PASS**
* **Git Checkpoint:** Committed at `b25d897`.

---

### PART 10: Deep Desktop Boot & Viewport Resolution (Problems A & B)
* **Problem A — Desktop App Stuck on Greeting / Black Box Panel:**
  * *Symptom:* `notch.exe` launched, but remained stuck on the greeting canvas. Expanding the notch revealed a black box with two greeting icons and zero content (`#content opacity: 0`).
  * *Root Cause:*
    1. `State.defaultView()` returned `this.view || "focus"`. When `island.launch()` started the greeting, `this.view` became `"greeting"`.
    2. Transition out of `"coucou"` called `State.defaultView()`, which returned `"greeting"`. Thus `State.view` remained locked as `"greeting"`.
    3. Expanding the notch while `State.view === "greeting"` hid `#content` and showed only `#greeting-canvas`.
    4. Pending `greetCollapse` timer in `fsm.ts` collided with manual expand triggers.
  * *Fix:*
    1. Validated `State.defaultView()` to strictly match active tabs (`focus`, `tasks`, `habits`, `wellbeing`, `insights`, `settings`), defaulting to `"focus"`.
    2. Reset `State.view = State.defaultView()` on `"coucou"` exit.
    3. In `island.expand()`, cancelled pending FSM timers (`this.fsm.cancelTimers()`) and set FSM state to `"home"`.
    4. Tuned greeting timeline in `mochi/greeting.ts` to `T.end: 3.6s, autoLeave: 3.8s` so Mochi completes cleanly in ~3.8s, well within 5.0s.
    5. Implemented a 5-second watchdog in `main.ts` that forces `island.fsm.forceHome()` and renders default UI if any promise stalls.
    6. Added `BOOT_READY <ms>` marker and `document.body.dataset.ready = "1"`.
* **Problem B — Viewport Truncation & Missing Scrollbars:**
  * *Symptom:* On smaller displays or high DPI scaling (e.g. 1024x600 at 1.5x scale), view content was truncated with no ability to scroll.
  * *Root Cause:* Fixed 270px container height and `overflow: hidden` without internal `overflow-y: auto`.
  * *Fix:*
    1. Enabled `overflow-y: auto; overflow-x: hidden; min-width: 0;` on `.view.on` with thin custom scrollbars.
    2. Made `.notch-view-body` responsive with dynamic height and safe padding.
    3. Expanded view layout heights in `layout.ts` (Focus: 290px, Tasks/Habits/Wellbeing/Insights: 330px, Settings: 340px).
    4. Clamped desktop window height to 380px within the monitor work area.
* **Desktop Judge Verification Suite (10/10 PASS):**
  * Executed `scripts/verify_desktop_judge_proof.mjs` against installed production `notch.exe`:
    1. Silent Install: **PASS**
    2. Clean Profile & `BOOT_READY`: **PASS (4326 ms)**
    3. Hover Expand, Collapse & FPS: **PASS (139.7 FPS in WebView2)**
    4. All 6 Tabs Render Real Content: **PASS (Focus, Tasks, Habits, Wellbeing, Insights, Settings all opacity = 1 with full DOM)**
    5. Camera Enable & Hardware Pause: **PASS**
    6. Privacy Isolation: **PASS (0 open TCP sockets)**
    7. Single-Instance Mutex: **PASS (Secondary ExitCode 0)**
    8. Relaunch After Kill: **PASS**
    9. Corrupt Settings Recovery: **PASS**
    10. Silent Uninstall: **PASS**
* **Web Viewport Suite (90/90 PASS):**
  * Executed `scripts/verify_web_viewports_after.mjs` across 15 viewport/scale configurations with 0 failures, 0 console errors, and 0 external requests.
* **Version Bump:** Bumped to **`v1.0.2`** across `package.json`, `Cargo.toml`, `tauri.conf.json`, `views.ts`, and documentation.

---

## 🔍 Key Technical Insights & Edge Cases Solved

1. **Windows Terminal GUI Subsystem Error `0x800700e8`:**
   * Error `2147942632 (0x800700e8)` is `ERROR_NO_DATA` ("The pipe is being closed").
   * Occurs when a Win32 GUI app (`#![windows_subsystem = "windows"]`) is run directly as the root shell command inside a Windows Terminal tab. Windows Terminal sets up a ConPTY pipeline expecting console stdin/stdout; the GUI process does not attach to ConPTY and closes standard streams.
   * Solution: GUI apps must be launched via double-click, Start Menu, or detached PowerShell `Start-Process`.
2. **Win32 `GetLastError()` Loader Pitfall:**
   * `CreateMutexW` only sets `GetLastError(ERROR_ALREADY_EXISTS)` if the mutex already exists. If the mutex is brand new, it does NOT reset `GetLastError()` to 0. Any earlier Win32 failure during C runtime / process loader initialization leaves `GetLastError()` non-zero. Calling `SetLastError(WIN32_ERROR(0))` immediately before `CreateMutexW` is mandatory for reliable single-instance checks.
3. **WebView2 User Data Folder Collision:**
   * If a second instance creates a Tauri window sharing `%LOCALAPPDATA%\<identifier>\EBWebView`, WebView2 throws `HRESULT(0x800700AA): The requested resource is in use` and panics with ExitCode 101. Intercepting the single-instance check in `fn main()` before `Builder::build()` eliminates all WebView2 lock collisions.
4. **Git Credential Manager Background Hang:**
   * Running `git push origin main` in a non-interactive subprocess spawned `git-credential-manager.exe` waiting for interactive desktop login, hanging the command. Killed the stuck process and documented running `git push` in the user's interactive shell.

---

## 📦 Deliverables Summary Table

| Deliverable | Location | Status |
| :--- | :--- | :--- |
| **🚀 Public Live Web Demo** | [https://jancherian.github.io/ergonotch/](https://jancherian.github.io/ergonotch/) | ✅ Live (10/10 E2E tests passing) |
| **📖 Product Landing Page** | [https://jancherian.github.io/ergonotch/about.html](https://jancherian.github.io/ergonotch/about.html) | ✅ Live & responsive |
| **📦 Windows Installer (.exe)** | [Release v1.0.2 on GitHub](https://github.com/jancherian/ergonotch/releases/tag/v1.0.2) | ✅ Packaged (`Notch-Setup.exe`, 54.57 MB) |
| **📁 Local Installer File** | `./coucou-windows-v0.5.3/windows/release/Notch-Setup.exe` | ✅ Built & verified locally |
| **🎬 Presentation & Demo Script** | [`./DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) | ✅ Ready for judges |
| **📋 Running Debug Log** | [`./DEBUG_LOG.md`](./DEBUG_LOG.md) | ✅ Triage & proofs logged |
| **📚 Full Documentation** | [`./README.md`](./README.md) | ✅ Updated with Troubleshooting guide |
| **🌿 Project Summary** | [`./SUMMARY.md`](./SUMMARY.md) | ✅ Updated & verified |

