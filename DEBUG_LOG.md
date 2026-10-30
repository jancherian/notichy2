# Notch Companion — Debug & Polish Log

Running log of all bugs, triage, root cause analyses, fixes, and verification proofs.

---

## PART 3: Web Demo Fixes & Verification

### Bug 3.1: MediaPipe WASM and model asset 404s
- **Evidence:** Console error `Failed to fetch wasm binary at /wasm/vision_wasm_internal.wasm (404 Not Found)` when camera started on GitHub Pages subpath `/ergonotch/`.
- **Root Cause:** Hardcoded root-relative paths `"/wasm/"` resolved to `https://jancherian.github.io/wasm/...` instead of `https://jancherian.github.io/ergonotch/wasm/...`.
- **Fix:** Switched to document base URL resolution:
  `new URL("wasm/", document.baseURI).href` and `new URL("models/pose_landmarker_lite.task", document.baseURI).href`.
- **Proof:** E2E Playwright test `scripts/verify_e2e_web.mjs` confirmed zero 404s on network log.

### Bug 3.2: Sound audio file 404s on subpath
- **Evidence:** Audio fetch 404s for `sounds/*.wav` when hosted under subdirectories.
- **Root Cause:** Path `sounds/${name}.wav` was not resolved relative to `document.baseURI`.
- **Fix:** Used `new URL('sounds/' + name + '.wav', document.baseURI).href` in `sound.ts`.
- **Proof:** All sounds load cleanly with zero network errors.

### Bug 3.3: 4.9-second launch greeting blocked web preview
- **Evidence:** Visiting the web demo showed a blank black canvas or stuck greeting for nearly 5 seconds before the notch became interactive.
- **Root Cause:** Desktop launch greeting sequence `fsm.launch()` ran full 4.9s intro sequence before revealing the interactive notch.
- **Fix:** In web preview mode, bypass the intro delay and invoke `island.fsm.reveal()` directly.
- **Proof:** Instant interactive pill appears on page load (< 200ms).

### Bug 3.4: Toggle Notch button & Pill click did not open default view
- **Evidence:** Clicking "Toggle Notch (Simulate Hover/Click)" or clicking the pill did not expand the panel.
- **Root Cause:** FSM click state required explicit mode change and `setPinned(true)`.
- **Fix:** Added fallback click handlers to trigger `island.expand(State.defaultView())` and `island.setPinned(true)`.
- **Proof:** E2E Playwright test verified click expands to 720px panel and all 6 tabs interact smoothly.

---

## PART 4: Windows Desktop Installer & Single-Instance Lock

### Bug 4.1: "Nothing happened" when clicking installed executable
- **Evidence:** Executable exited within 1 second with ExitCode 101. No window appeared.
- **Root Cause:**
  1. A previous zombie process was holding the WebView2 User Data Folder (`EBWebView`) lock.
  2. `tauri-plugin-single-instance` used Win32 `FindWindowW` which failed for frameless tool windows, falling through to initialize WebView2 twice and crashing with `HRESULT(0x800700AA): The requested resource is in use`.
  3. C runtime loader left non-zero error in `GetLastError()`, causing naive `CreateMutexW` checks to trigger false-positive secondary instance exits.
- **Fix:**
  1. Added explicit `SetLastError(WIN32_ERROR(0))` before `CreateMutexW` in `main.rs`.
  2. Guarded single-instance check in native Win32 before Tauri or WebView2 initialization; secondary instances exit immediately with code 0 without touching WebView2 lock.
  3. Removed conflicting `tauri_plugin_single_instance` from `lib.rs`.
  4. Added panic hook and file logger writing to `%LOCALAPPDATA%\Notch\logs\app.log`.
  5. Renamed binary to `notch.exe` and product name to `Notch`.
- **Proof:**
  - `Notch-Setup.exe /S` installed cleanly to `%LOCALAPPDATA%\Notch\notch.exe`.
  - Process runs cleanly with PID in Task Manager, working set ~54MB, zero TCP connections.
  - Secondary instance launched via shortcut exits with code 0, primary instance remains running uninterrupted.

---

## PART 5: Animation Smoothness & 60 FPS Target

### Bug 5.1: Hover flicker from fast cursor sweeps
- **Evidence:** Moving cursor quickly past top of screen accidentally expanded the entire notch panel.
- **Root Cause:** `fsm.mouseEntered()` immediately transitioned from `hidden`/`petit` to `home` without hysteresis debounce.
- **Fix:** Added 130ms hover enter hysteresis in `fsm.ts` (`hoverEnterTimer`). Fast sweeps (<100ms) cancel the timer before expansion occurs; intentional hovers (>130ms) open smoothly.
- **Proof:** `scripts/verify_animations.mjs` Test 1 confirmed fast 60ms cursor sweep leaves pill collapsed at 288px (`Resisted open: true`), while intentional hover expands to 644px.

### Bug 5.2: Slow, sluggish spring response curve
- **Evidence:** Expand animation took > 500ms and felt loose/heavy.
- **Root Cause:** Default spring configuration in `anim.ts` was `response = 0.5` (500ms) with `damping = 0.72`, and collapse ease was 340ms.
- **Fix:** Tuned `Spring` and `Tracked` in `anim.ts` to `response = 0.32, damping = 0.78` (~300ms snappy expand) and collapse duration to 280ms with cubic-bezier ease curve.
- **Proof:** Measured 60.3 FPS with average frame delta of 16.58ms across multiple expand/collapse cycles.

### Bug 5.3: Main thread jank during posture inference
- **Evidence:** MediaPipe pose landmarker running on main thread could drop frames during expand/collapse transitions.
- **Root Cause:** Inference loop ran continuously every 200ms regardless of window animation state.
- **Fix:** Added `State.isGeometryAnimating` flag. In `posture.ts`, inference skips frames while the notch is expanding or collapsing (280-320ms) so CPU/GPU is 100% dedicated to 60fps rendering. Throttled collapsed posture checks to ~2 fps (500ms) to conserve CPU/battery.
- **Proof:** Playwright benchmark reported **0 long frames (>25ms)** and **0 jank frames (>50ms)** during 5 continuous expand/collapse cycles.

### Bug 5.4: Animation respect for `prefers-reduced-motion` and settings
- **Evidence:** Users with accessibility reduced motion or disabled animations still experienced physics spring movement.
- **Root Cause:** `animateGeometry` always executed `springTo()` and `curveTowards()`.
- **Fix:** Added `shouldAnimate()` checking `window.matchMedia("(prefers-reduced-motion: reduce)").matches` and `body.no-animations`. Snaps geometry immediately via `this.width.jump(w)` with zero duration, and added CSS reduced-motion overrides.
- **Proof:** `verify_animations.mjs` Test 4 confirmed immediate width snap under reduced motion in < 30ms.

---

## PART 8: Documentation, Verification & Cleanup

### Bug 8.1: Hardcoded absolute `file:///` URLs in documentation
- **Evidence:** `README.md` and `SUMMARY.md` contained machine-specific absolute file links (`file:///c:/Users/Jan%20Cherian%20Thomas/...`).
- **Root Cause:** Artifact paths were exported as local OS file URLs instead of relative repo paths.
- **Fix:** Converted all file links to relative Markdown links (`./DEMO_SCRIPT.md`, `.github/workflows/release.yml`, `./README.md`).
- **Proof:** Workspace search across all `.md` files confirmed zero remaining `file:///c:/Users` links.

### Bug 8.2: Outdated local PID and executable naming in summary
- **Evidence:** `SUMMARY.md` contained `coucou.exe (PID 5092)`.
- **Root Cause:** Legacy development process label was not updated after renaming to `notch.exe` in Part 4.
- **Fix:** Replaced with `notch.exe (Windows 10/11 x64)` and verified single-instance execution.
- **Proof:** Process table and log inspection confirms `notch.exe` running without any Coucou references.

### Bug 8.3: Verification of "0 outbound sockets" claim
- **Evidence:** Privacy claim required verifiable command-line proof on the production executable.
- **Root Cause:** Unsubstantiated claims violate project rules ("Never claim something is fixed without proof").
- **Fix:** Documented exact reproducible command in README & Summary:
  `Get-NetTCPConnection -OwningProcess (Get-Process notch).Id -ErrorAction SilentlyContinue` which returns 0 open TCP connections.
- **Proof:** Re-ran against running `notch.exe` instance; confirmed 0 outbound sockets.

### Bug 8.4: Missing Troubleshooting guidance for judges
- **Evidence:** Users encountering SmartScreen or running a secondary instance without closing the first could see nothing happen.
- **Root Cause:** Documentation lacked clear instructions on Windows SmartScreen, WebView2 Runtime requirements, and single-instance mutex mechanics.
- **Fix:** Added dedicated **Troubleshooting** table to `README.md` covering SmartScreen bypass, single-instance mutex checking via system tray, and `%LOCALAPPDATA%\Notch\logs\app.log` inspection.
- **Proof:** Reviewed in `README.md`.

---

## PART 10: Deep Desktop Boot & Responsive Viewport Fixes (Problems A & B)

### Bug 10.1: Desktop App Stuck on Greeting / Black Box with Two Icons (Problem A)
- **Evidence:**
  - Launching `notch.exe` over CDP (`--remote-debugging-port=9222`) captured state `fsmState: "coucou"`, `view: "greeting"`.
  - At timeline t=4s, FSM transitioned to `"petit"`, but `State.view` remained `"greeting"`.
  - Calling `island.expand()` resulted in `expandResult: { success: true, mode: 'expanded', view: 'greeting' }`.
  - DOM inspection revealed: all tabs active = false; all view containers (`#views .view`) styled with `opacity: 0`; `#content` styled with `opacity: 0`; `greetingCanvas` styled with `display: block`.
  - Screenshot `diagnostics/desktop_cdp/after_expand.png` proved the exact symptom: a black panel showing only the two greeting canvas icons with zero interactive content.
- **Root Cause:**
  1. `State.defaultView()` returned `this.view || "focus"`. When `island.launch()` started the greeting, `State.view` was set to `"greeting"`.
  2. On FSM transition `from === "coucou" -> to === "petit"`, `island.ts` executed `State.view = State.defaultView()`. Because `this.view` was `"greeting"`, `State.defaultView()` returned `"greeting"`. Thus `State.view` remained stuck as `"greeting"` permanently.
  3. Subsequent hovers and clicks called `island.expand(State.defaultView())`, expanding into `"greeting"`. In `island.ts`, `State.view === "greeting"` explicitly sets `#content` (containing the tabs and all views) to `opacity: 0` and `#greeting-canvas` to `display: block`.
  4. In `fsm.ts`, `click()` was ignored when in `"coucou"` state (`if (this.state !== "petit") return;`).
- **Fix:**
  1. Updated `State.defaultView()` in `state.ts` to strictly validate against valid tabs (`"focus" | "tasks" | "habits" | "wellbeing" | "insights" | "settings"`), returning `"focus"` if `this.view` is `"greeting"` or non-tab.
  2. In `island.ts` `wireFsm()`, explicitly reset `State.view = "focus"` upon leaving `"coucou"`.
  3. In `fsm.ts`, allow `click()` while in `"coucou"` to immediately interrupt the greeting and transition to `"home"`.
  4. Added global `window.onerror` and `unhandledrejection` handlers reporting directly to `%LOCALAPPDATA%\Notch\logs\app.log`.
  5. Implemented a 5-second boot watchdog that forces `island.fsm.forceHome()` and renders default UI with a fallback banner if boot stalls.
  6. Added `BOOT_READY` marker: sets `document.body.dataset.ready = "1"` and logs `BOOT_READY <ms>` on interactive mount.
- **Proof:**
  - Tested in-memory fix over CDP: `window.state.view = "focus"` and `window.island.expand("focus")`.
  - Saved screenshot `diagnostics/desktop_cdp/test_focus_expanded.png` confirming the full interactive Focus UI rendered with wizard hat Mochi, timer digits, preset buttons, tabs, and overview chips.

### Bug 10.2: Content Clipping & Lack of Scrolling across Resolutions (Problem B)
- **Evidence:**
  - Comprehensive Playwright screenshot suite executed across 5 resolutions (1024x600, 1280x720, 1366x768, 1536x864, 1920x1080) at scale factors 1x, 1.25x, 1.5x (`diagnostics/web_viewports_before/`).
  - `1024x600_s1.5_settings.png`: Settings panel cut off below "Hover Zone Sensitivity"; Privacy & Data, sockets status, and MIT footer unreachable.
  - `1024x600_s1.5_tasks.png`: Only 2 tasks visible out of 5; remaining tasks clipped with no scrollbar.
  - `1024x600_s1.5_habits.png`: Only 1 habit visible out of 4; other habits hidden below bottom edge.
  - `1024x600_s1.5_wellbeing.png`: Posture metric cards ("Forward Head", "Shoulder Level", "Spine Posture") bottom borders and metrics cut off.
  - `1024x600_s1.5_insights.png`: 7-day focus activity chart and timeline cut off at bottom.
- **Root Cause:**
  1. In `layout.ts`, `VIEW_LAYOUTS` fixed height was 270px for all views, while actual content requires 330px-350px.
  2. In `style.css`, `#island-clip` has `overflow: hidden`, and `.view` had `position: absolute; inset: 0;` without `overflow-y: auto`. Any content exceeding 270px was hard-clipped with zero ability to scroll.
  3. No viewport clamping or safe bottom padding existed for low-height viewports (e.g. 600px height at 1.5x scale).
- **Fix:**
  1. In `style.css`, enabled `overflow-y: auto; overflow-x: hidden; min-width: 0;` on `.view.on` with thin custom scrollbar styling.
  2. Set `.notch-view-body` to `height: auto; min-height: 100%; box-sizing: border-box; min-width: 0; justify-content: flex-start; gap: 8px; padding-bottom: 16px;`.
  3. Updated `VIEW_LAYOUTS` in `layout.ts` to accommodate natural view heights (Focus: 290px, Tasks: 330px, Habits: 330px, Wellbeing: 330px, Insights: 330px, Settings: 340px).
  4. In `island.ts` `targetSize()`, clamped expanded height to `Math.min(h, window.innerHeight - 36)`.
  5. In Rust `island.rs`, increased `PANEL_H` from 320px to 380px and clamped to the monitor work area.
- **Proof:**
  - Viewport diagnostic suite `scripts/verify_web_viewports_after.mjs`: verified across 15 configurations (1024x600, 1280x720, 1366x768, 1536x864, 1920x1080 at 1x, 1.25x, 1.5x) with **90/90 checks PASSED (0 failures)**.
  - Screenshots in `diagnostics/web_viewports_after/`:
    - `1024x600_s1.5_settings.png`: Scroll container active; Privacy & Data, 0-sockets claim, and version footer fully reachable.
    - `1024x600_s1.5_tasks.png`: All tasks accessible with clean scrollbar.
    - `1024x600_s1.5_habits.png`: All habits and 7-day dot matrix fully reachable.
    - `1024x600_s1.5_wellbeing.png`: All metric cards and camera toggle reachable.
    - `1024x600_s1.5_insights.png`: 7-day focus activity chart and timeline fully reachable.

---

## PART 11: Production Desktop Judge Verification Proof (Step 5 Acceptance)

Automated test suite `scripts/verify_desktop_judge_proof.mjs` executed over Chrome DevTools Protocol (`--remote-debugging-port=9222`) against installed production executable `C:\Users\Jan Cherian Thomas\AppData\Local\Notch\notch.exe`:

1. **Test 1 — Silent Install:** Installed `coucou-windows-v0.5.3/windows/release/Notch-Setup.exe /S` cleanly. Target executable confirmed at `C:\Users\Jan Cherian Thomas\AppData\Local\Notch\notch.exe` (54.57 MB package). **PASS**
2. **Test 2 — Clean Profile & BOOT_READY:** Wiped `%APPDATA%\Notch` and `%LOCALAPPDATA%\Notch\EBWebView`. Launched detached. Verified `BOOT_READY 4326ms` logged in `%LOCALAPPDATA%\Notch\logs\app.log` (< 5000ms watchdog limit). Screenshot: `diagnostics/desktop_cdp/judge_01_boot_ready.png`. **PASS**
3. **Test 3 — Hover Expand, Collapse & 60 FPS:** Simulated hover over top notch. Measured **139.7 FPS** in WebView2 (Target >= 60 FPS, 0 jank frames). Window expanded from 288x32px to 640x290px and collapsed cleanly. Screenshots: `diagnostics/desktop_cdp/judge_02_hover_expanded.png`, `judge_03_collapsed.png`. **PASS**
4. **Test 4 — All 6 Tabs Render Real Content:** Inspected all tabs over CDP. Asserted `opacity == 1` and non-empty DOM:
   - `focus`: Focus timer active, Mochi wizard hat visible, preset buttons (`diagnostics/desktop_cdp/judge_tab_focus.png`). **PASS**
   - `tasks`: 5 tasks rendered with priorities, checkboxes, and active task binding (`diagnostics/desktop_cdp/judge_tab_tasks.png`). **PASS**
   - `habits`: 4 daily habits with streaks and 7-day completion dots (`diagnostics/desktop_cdp/judge_tab_habits.png`). **PASS**
   - `wellbeing`: Camera posture toggle, 3 posture cards, facial fatigue card (`diagnostics/desktop_cdp/judge_tab_wellbeing.png`). **PASS**
   - `insights`: 4 provenance-tagged metrics, 7-day focus bar chart (`diagnostics/desktop_cdp/judge_tab_insights.png`). **PASS**
   - `settings`: System & vision toggles, sliders, 0-sockets privacy claim, MIT credit (`diagnostics/desktop_cdp/judge_tab_settings.png`). **PASS**
5. **Test 5 — Camera Toggle & Hardware Pause:** Toggled camera switch; confirmed video stream element created. Clicked pause; confirmed track stop and hardware camera release (`diagnostics/desktop_cdp/judge_04_camera_active.png`). **PASS**
6. **Test 6 — Zero Outbound Sockets:** Queried `Get-NetTCPConnection -OwningProcess <pid>`. Output: `0_SOCKETS`. Verified zero outbound network telemetry. **PASS**
7. **Test 7 — Single-Instance Mutex:** Launched secondary instance. Secondary exited cleanly with `ExitCode 0`. Primary instance continued running uninterrupted. **PASS**
8. **Test 8 — Relaunch After Kill:** Terminated primary instance and relaunched. Reached `BOOT_READY` in 4110ms with preserved configuration. **PASS**
9. **Test 9 — Corrupt Settings Recovery:** Injected invalid JSON into `%APPDATA%\Notch\settings.json`. Launched `notch.exe`. App booted successfully and recovered to safe default settings. **PASS**
10. **Test 10 — Silent Uninstall:** Executed `%LOCALAPPDATA%\Notch\uninstall.exe /S`. Process terminated and executable removed cleanly from disk. **PASS**

**Result: 10/10 Judge Tests PASSED.**

---

## PART 12: Pre-Removal Baseline (Part 0)

1. **Safety Tag & Installer Backup:**
   - Git state clean on branch `main` at commit `658c2cc`.
   - Local safety tag created: `known-good-v1.0.2`.
   - Backup installer preserved: `C:\Users\Jan Cherian Thomas\backup\Notch-Setup-v1.0.2-known-good.exe`.
   - Backup SHA256: `95A3EE2635BBFD60A5859B009D7AE8E5C049D0BF5C3165BAE8A2995BF86F4D58`.

2. **Baseline Measurements:**
   - **Active Windows Owned by notch.exe (PID 25732):**
     1. Notch Island (Top notch): `720x380` at `408,0`, Class: `Tauri Window`, Visible: `True`.
     2. Leftover Call Island (Pill): `520x170` at `128,128`, Class: `Tauri Window`, Visible: `True` (Target for removal).
     3. Mochi Companion: `133x120` at `77,77`, Class: `Tauri Window`, Visible: `True`.
     4. Settings Window: `1114x758` at `210,33`, Class: `Tauri Window`, Visible: `False` (until opened).
   - **Boot Speed (app.log):** `BOOT_READY 4326ms` (watchdog limit 5000ms).
   - **Network Sockets:** `0_SOCKETS` (verified with `Get-NetTCPConnection`).
   - **Automated Verification Suites:**
     - `scripts/verify_desktop_judge_proof.mjs`: 10/10 tests PASSED.
     - `scripts/verify_web_viewports_after.mjs`: 90/90 tests PASSED.
     - `scripts/verify_e2e_web.mjs`: 10/10 tests PASSED.

---

## PART 13: Leftover Call Island Analysis & Removal Plan (Parts 1 & 2)

### 1. Root Cause & Owner Identification
- **Window Label:** `"pill"`
- **Window HTML Entry:** `coucou-windows-v0.5.3/windows/pill.html`
- **Window TS/CSS Entry:** `coucou-windows-v0.5.3/windows/src/pill/main.ts` and `pill.css`.
  - Lines 163-166 of `main.ts` explicitly construct:
    - Dictate button: `pillButton("mic", t("Dictate · {0}", ...))`
    - Record button: `pillButton("record", t("Record a call"), () => void FlowBridge.pillAction("note"))`
    - Hub button: `pillButton("window", t("Open Coucou"), () => void FlowBridge.pillAction("hub"))`
- **Rust Creation Point:** `coucou-windows-v0.5.3/windows/src-tauri/src/flow/pill.rs` via `flow::setup(&handle)`.
  - In `flow/pill.rs`: `let park = cfg!(windows); builder.visible(park);` creates and shows the window on launch.
- **Tauri Configs:**
  - `src-tauri/capabilities/default.json` lists `"pill"` under `windows`.
  - `vite.config.ts` lists `pill: resolve(__dirname, "pill.html")`.
- **Leftover Coucou Folder Source:**
  - `nsis/hooks.nsh` lines 12-14 attempts to clean `$LOCALAPPDATA\Coucou\bin`, but not parent folder.
  - Previous builds wrote to `%LOCALAPPDATA%\Coucou`. Data path has already been redirected to `%LOCALAPPDATA%\Notch` and `%APPDATA%\Notch`. Migration logic is verified.

### 2. "SHARED - DO NOT TOUCH" List (Hard Protection Rules)
- **Posture & Fatigue AI Camera Pipeline:** `src/camera/posture.ts`, `src/camera/fatigue.ts` (uses browser `getUserMedia({ video: true })` inside `index.html` with MediaPipe; does NOT touch `cpal` or `speech/`). Keep `camera` capability.
- **Sound Effects & Audio Playback:** `src/core/sound.ts`, `sounds/*.wav`, `src-tauri/src/sounds.rs` (playback only via Web Audio API and file streaming; zero microphone recording).
- **Core Companion UI & Architecture:** `fsm.ts`, `island.ts`, `anim.ts`, `layout.ts`, `style.css`, `index.html`, all 6 tabs (Focus, Tasks, Habits, Wellbeing, Insights, Settings).
- **Mochi Window:** `src/mochi/`, `src-tauri/src/desktop.rs` (Mochi companion window is preserved).
- **Settings Window:** `settings.html`, `src/settings/`, `src-tauri/src/lib.rs` (Settings window is preserved).
- **Single-Instance Mutex & Logging:** `src-tauri/src/main.rs`, `src-tauri/src/log.rs`.
- **Boot Watchdog & Markers:** `BOOT_READY` in `main.ts` and `index.html`.
- **Web Demo & Offline Capabilities:** `platform.ts`, 0 outbound network calls.
- **MIT Attribution:** "Based on Coucou (MIT License)" retained in Settings and documentation.

### 3. "BELONGS ONLY TO CALL ISLAND" List (Removal Targets)
- **Frontend Assets & Windows:**
  - `coucou-windows-v0.5.3/windows/pill.html`
  - `coucou-windows-v0.5.3/windows/src/pill/` (`main.ts`, `pill.css`)
  - `"pill"` entry in `coucou-windows-v0.5.3/windows/vite.config.ts`
  - `"pill"` label in `coucou-windows-v0.5.3/windows/src-tauri/capabilities/default.json`
- **Rust Setup & Handlers:**
  - `flow::setup(&handle)` and `notes::setup(&handle)` in `coucou-windows-v0.5.3/windows/src-tauri/src/lib.rs`.
  - `notes::shutdown(app)` in `src-tauri/src/lib.rs`.
  - `flow::pill_*` Tauri commands (`pill_state`, `pill_hot`, `pill_hover`, `pill_action`).
  - `notes::*` Tauri commands (`notes_state`, `notes_start`, `notes_stop`, `notes_rename`, `notes_rename_speaker`, `notes_toggle_todo`, `notes_delete`, `notes_summarize`, `notes_retry`, `notes_markdown`, `notes_export`).
  - `flow::flow_*` dictation commands in `lib.rs`.
  - `src-tauri/src/flow/pill.rs`
- **Rust Unused Modules & Dependencies:**
  - `src-tauri/src/notes/` (Notetaker, diarizer, call recording).
  - `src-tauri/src/speech/audio.rs` (WASAPI loopback audio capture via `cpal`).
  - Cargo dependencies: `cpal` (audio input capture), `sherpa-onnx` (speech recognition).
- **Residual Coucou Folder Cleaning:**
  - `nsis/hooks.nsh`: Remove `$LOCALAPPDATA\Coucou` directory completely on uninstall/upgrade.

---

## PART 14: Post-Removal Verification Results (Part 4)

1. **Visual Proof & Window Proof (Win32 Enumeration):**
   - Win32 `EnumWindows` scan of all visible top-level windows owned by `notch.exe` (PID 28956):
     - `Mochi` (133x120 at 51,51) - Visible
     - `Notch` Island (720x380 at 408,0) - Visible
     - `Notch` Settings (1114x758 at 210,33) - Hidden until opened
   - **Call Pill (`520x170` at `128,128`):** 100% GONE from window table and screen.

2. **Automated Verification Suites Proof:**
   - **Production Desktop Judge Proof (`scripts/verify_desktop_judge_proof.mjs`):**
     - **10/10 Tests PASSED (0 failures)** on `Notch-Windows-1.0.3-setup.exe`.
     - Silent install: PASS (77.62 MB installed binary).
     - Clean profile boot: PASS (`BOOT_READY 4199ms`).
     - Hover expand/collapse & 60 FPS: PASS (144.1 FPS measured inside WebView2).
     - 6 Tabs Content: PASS (Focus, Tasks, Habits, Wellbeing, Insights, Settings all populated).
     - Local camera posture active and pause: PASS.
     - Outbound sockets check: PASS (`0_SOCKETS`).
     - Single-instance mutex: PASS (secondary exits with code 0).
     - Relaunch after kill: PASS.
     - Corrupt settings recovery: PASS.
     - Silent uninstall: PASS.
   - **Responsive Web Viewports Suite (`scripts/verify_web_viewports_after.mjs`):**
     - **90/90 Tests PASSED (0 failures)** across 15 viewport and scale combinations.
   - **Web E2E Verification Suite (`scripts/verify_e2e_web.mjs`):**
     - **10/10 Tests PASSED (0 failures)**.

3. **Upgrade Proof (`scripts/verify_upgrade_proof.mjs`):**
   - Installed known-good `v1.0.2` baseline from backup folder.
   - Wrote user test data (`upgrade-test-task-1` and `upgrade-test-habit-1`).
   - Installed `v1.0.3` production setup directly over existing install without wiping data.
   - Launched `v1.0.3` over CDP: confirmed `{"hasTask": true, "hasHabit": true}`.
   - Result: **PASS** (Zero data loss).

4. **Cleanliness Proof:**
   - Verified `%LOCALAPPDATA%\Coucou`: **Does not exist (False)**.
   - Verified `%APPDATA%\Coucou`: **Does not exist (False)**.
   - Verified `Program Files\Coucou`: **Does not exist (False)**.
   - Result: **PASS** (100% clean filesystem).

---

## 2026-10-30 - Release v1.0.4 Verification & Package Audit

### Verification Summary
- **Artifact:** `Notch-Setup.exe` (and `Notch-Windows-1.0.4-setup.exe`)
- **Version:** `1.0.4` (ProductVersion: `1.0.4.0`, FileVersion: `1.0.4.0`)
- **File Size:** 59,311,665 bytes (56.56 MB)
- **SHA256:** `5621127A88FD750CF67E72B76D1A6F89ECE767EF55CAA37B31842A7CC9E2308F`

### Test Suite Results
1. **Desktop Judge Suite (`scripts/verify_desktop_judge_proof.mjs`): 10/10 PASS**
   - Silent install from `Notch-Setup.exe`: PASS
   - Clean profile launch: PASS (`BOOT_READY` at 4096 ms < 5000 ms limit)
   - Hover expand/collapse: PASS (142.5 FPS inside WebView2, 0 jank frames)
   - All 6 tabs active & populated: PASS (`judge_tab_focus.png`, `judge_tab_tasks.png`, `judge_tab_habits.png`, `judge_tab_wellbeing.png`, `judge_tab_insights.png`, `judge_tab_settings.png`)
   - Camera posture enable & pause cycle: PASS (`judge_04_camera_active.png`)
   - Zero outbound sockets: PASS (`0_SOCKETS` on port scan)
   - Single-instance mutex: PASS (secondary instance exits with code 0)
   - Clean relaunch after process kill: PASS
   - Corrupt settings recovery: PASS
   - Silent uninstaller: PASS

2. **Web E2E Verification Suite (`scripts/verify_e2e_web.mjs`): 10/10 PASS**
   - Page load 200 OK, pill render, animation, 6 tabs, focus timer, tasks CRUD, habits localStorage persistence, local posture camera AI, 0 console errors, 0 failed network requests.

3. **Responsive Web Viewports Suite (`scripts/verify_web_viewports_after.mjs`): 90/90 PASS**
   - 15 resolution/scale configs (1024x600, 1280x720, 1366x768, 1536x864, 1920x1080 at 100%, 125%, 150%) across all 6 tabs with 0 layout clipping or overflow.

4. **GitHub Actions Workflow Upgrade:**
   - Updated `.github/workflows/release.yml` with automated packaging and asset upload for rolling `Notch-Setup.exe` via `softprops/action-gh-release@v2`.

---

## 2026-10-30 - Vercel Multi-Page Vite Configuration & Deployment Fix

### Problem
- `https://ergonotch.vercel.app/about.html` returned HTTP 200, but `https://ergonotch.vercel.app/` returned HTTP 404 Not Found.

### Root Cause
1. Vercel was configured to serve the repo root as a static directory without invoking `npm run build`, because `index.html` lives inside `coucou-windows-v0.5.3/windows/` and Vercel's project Root Directory was set to `.`.
2. `about.html` was not part of the Vite build inputs or `public/` directory inside `coucou-windows-v0.5.3/windows/`, so building Vite did not place `about.html` at the `dist/` root.
3. No `vercel.json` was configured to specify `framework: "vite"`, `outputDirectory: "dist"`, or security/MIME headers (`Permissions-Policy: camera=(self)`, `application/wasm`, immutable asset caching).

### Solution
1. **Multi-page Vite Input:** Added `about: resolve(__dirname, "about.html")` to `build.rollupOptions.input` in `coucou-windows-v0.5.3/windows/vite.config.ts`.
2. **Public Root Mirror:** Placed `about.html` in `coucou-windows-v0.5.3/windows/public/about.html`.
3. **Vercel Configuration:** Created `coucou-windows-v0.5.3/windows/vercel.json`:
   - `framework`: `"vite"`
   - `buildCommand`: `"npm run build"`
   - `outputDirectory`: `"dist"`
   - Headers: `Permissions-Policy: camera=(self)` on all routes, `Content-Type: application/wasm` for `.wasm`, and long cache for `/assets/*`. Zero rewrites that shadow or hide `about.html`.

### Verification
- **Build Output Root (`coucou-windows-v0.5.3/windows/dist`):**
  - `index.html` (636 bytes): PRESENT
  - `about.html` (23,269 bytes): PRESENT
  - `assets/`: PRESENT
  - `wasm/`: PRESENT
  - `models/`: PRESENT
  - `sounds/`: PRESENT
- **Local Preview E2E Suite (`scripts/verify_e2e_web.mjs`): 10/10 PASS**
  - Page Load 200 OK, Notch Pill Rendered, 6 Tabs Populated, Focus Timer, Tasks CRUD, Habits persistence, Local Posture MediaPipe AI with fake webcam, 0 console errors, 0 external/failed requests.
- **Local Preview About Page:** Returns 200 OK with identical title and links.
- **Responsive Viewports Suite (`scripts/verify_web_viewports_after.mjs`): 90/90 PASS** across all 15 resolution/scale configs.

---

## 2026-10-30 - Four Desktop Bugs (v1.0.4) Fix & Verification

### Bug 1: CRASH — App closes spontaneously without user exit
- **Evidence:** Users reported `notch.exe` closing after varying periods without any crash dialog or Windows Error Reporting events.
- **Root Cause:**
  1. Tauri 2's event loop automatically exits whenever a window close event occurs or an unhandled exit event bubbles up, unless `api.prevent_exit()` is invoked on `RunEvent::ExitRequested`.
  2. The frameless layered `island` and `mochi` windows did not attach `on_window_event` handlers with `WindowEvent::CloseRequested => api.prevent_close()`.
  3. Any system-level or shell message requesting close caused the entire app to exit without error.
- **Fix:**
  - In `src-tauri/src/lib.rs`: Added atomic bool `QUIT_REQUESTED`, `request_quit()`, and `is_quit_requested()`.
  - In `.run()` event loop handler: Added `RunEvent::ExitRequested { api, .. }` check calling `api.prevent_exit()` unless `is_quit_requested()`.
  - Attached `on_window_event` on the `island` window and `desktop.rs` Mochi window to intercept `WindowEvent::CloseRequested` and call `api.prevent_close()`.
  - In `src-tauri/src/tray.rs`: System tray `"quit"` menu item explicitly sets `crate::request_quit()` before calling `app.exit(0)`.
  - Added Rust panic hook in `main.rs` writing panics to `%LOCALAPPDATA%\Notch\logs\app.log`.
- **Commit:** `66416f0 fix: crash`

### Bug 2: SCROLL — Tabs do not scroll with mouse wheel; Focus tab bottom controls cut off
- **Evidence:** Focus tab bottom info (action buttons `Start Focus`, `Reset`, and `Attached: Review quarterly project plan`) was clipped; mouse wheel over the card did nothing.
- **Root Cause:**
  1. In `src/style.css`, `.card` had `height: 100%; overflow: hidden;` while `.view.on` had `overflow-y: auto`. Since `.card` was constrained to 100% of `.view`, `.view` never overflowed, `.card` clipped its contents, and mouse wheel events over the card were dropped.
  2. In `src/core/layout.ts`, `VIEW_LAYOUTS.focus.height` was set to 290px, leaving only ~215px inside `.card` after top navigation tabs, sub-status bar, and margins. The timer digits, presets, steppers, buttons, and task row require 320px+.
- **Fix:**
  - In `src/core/layout.ts`: Increased `focus`, `overview`, and `empty` layout height from 290px to 350px (and other tab layouts to 340px).
  - In `src/style.css`: Changed `.card` to `overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent;`. Set `.view.on` to `overflow: hidden` to eliminate double scrollbars.
- **Commit:** `d4e20c8 fix: scroll`

### Bug 3: POPUP — Default empty popup appears on top-middle cursor hover
- **Evidence:** Moving cursor to the top center of the screen showed an empty/greeting popup or leftover Coucou view instead of the standard Notch Focus panel with real data.
- **Root Cause:**
  1. In `src/island/island.ts`, `openingView()` did not sanitize `State.view`, allowing fallback views like `"overview"` or `"empty"` to render.
  2. `buildEmpty()` and `buildOverview()` in `src/views/views.ts` contained legacy placeholder views from upstream Coucou.
- **Fix:**
  - In `src/island/island.ts`: Updated `openingView()` to validate that `State.view` is one of the 6 canonical tabs (`"focus"`, `"tasks"`, `"habits"`, `"wellbeing"`, `"insights"`, `"settings"`), strictly defaulting to `"focus"`. In `expand()`, sanitized the target view similarly.
  - In `src/views/views.ts`: Replaced `buildEmpty()` body with `return buildFocus(actions);`. In `buildOverview()`, redirected any sync on `"overview"` immediately to `actions.setView("focus")`.
- **Commit:** `ef8e1ef fix: popup`

### Bug 4: SLOW START — App sits on greeting animation for several seconds
- **Evidence:** After install and launch, the app was stuck displaying a greeting animation for ~4.9s before showing the collapsed pill.
- **Root Cause:** Desktop boot in `src/main.ts` invoked `island.launch()`, which triggered `IslandStateMachine.launch()` -> coucou greeting animation with full timer delays.
- **Fix:**
  - In `src/main.ts`: Removed `island.launch()` greeting delay on desktop. Replaced with `State.view = "focus"; island.fsm.reveal(); markBootReady();`.
  - In `src/island/fsm.ts`: Configured `launch()` to transition immediately to `"petit"`.
- **Measurement:** Warm starts measure between 516ms and 595ms in `%LOCALAPPDATA%\Notch\logs\app.log` (well under the 1.5s requirement).
- **Commit:** `6d4a9d8 fix: slow start`

### Soak Test Results
- **Process:** `notch.exe` (PID 29384)
- **Uptime:** 20+ minutes continuous without restart, exit, or crash.
- **Memory:** Flat ~38.6 MB WorkingSet, ~11.6 MB Private Bytes.
- **Sockets:** 0 outbound / 0 listening TCP connections (100% offline).








