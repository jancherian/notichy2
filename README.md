# Notch Companion 🌿

> **An ambient Windows desktop companion for deep focus, physical ergonomics, and daily wellbeing.**  
> Lives quietly at the top of your screen as a translucent dark island. 100% offline, zero telemetry, local-first.

[![Live Web Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-success?style=for-the-badge&logo=github)](https://jancherian.github.io/ergonotch/)
[![Vercel Mirror](https://img.shields.io/badge/Live%20Mirror-Vercel-000000?style=for-the-badge&logo=vercel)](https://ergonotch.vercel.app/)
[![Landing Page](https://img.shields.io/badge/Product-Landing%20Page-9333ea?style=for-the-badge&logo=googlechrome)](https://jancherian.github.io/ergonotch/about.html)
[![Windows Installer](https://img.shields.io/badge/Download-Windows%20Setup%20v1.0.4-blueviolet?style=for-the-badge&logo=windows)](https://github.com/jancherian/ergonotch/releases/download/v1.0.4/Notch-Setup.exe)
[![Verification Suite](https://img.shields.io/badge/Verification-100%25%20Passing-brightgreen?style=for-the-badge&logo=checkmarx)](./DEBUG_LOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](https://github.com/jancherian/ergonotch/blob/main/LICENSE)

---

## 🌐 Quick Access for Evaluators & Judges

| Destination | Link | Description | Verification Status |
| :--- | :--- | :--- | :--- |
| **🚀 Public Live Web Demo** | [jancherian.github.io/ergonotch](https://jancherian.github.io/ergonotch/) | One-click interactive in-browser demo. Runs local MediaPipe WASM posture analysis via `getUserMedia` with zero installation. | ✅ 10/10 E2E passing |
| **⚡ Fast Web Mirror (Vercel)** | [ergonotch.vercel.app](https://ergonotch.vercel.app/) | High-speed global edge mirror with dedicated WASM MIME and camera permissions policy headers. | ✅ 10/10 E2E passing |
| **📖 Product Landing Page** | [jancherian.github.io/ergonotch/about.html](https://jancherian.github.io/ergonotch/about.html) | Single-page product overview, architecture breakdown, module guide, and privacy philosophy. | ✅ Live & responsive |
| **📦 Windows Desktop App (.exe)** | [Download Notch-Setup.exe (v1.0.4)](https://github.com/jancherian/ergonotch/releases/download/v1.0.4/Notch-Setup.exe) | Single-user NSIS installer (`~56.6 MB`). Runs 100% offline. No administrator rights required. | ✅ 10/10 Judge proof passing |
| **🎥 Backup Demo Walkthrough** | [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) | 2-minute judge-ready walkthrough script & presentation checklist in case of Wi-Fi/hardware issues. | ✅ Complete |
| **🧪 Automated Verification Log** | [DEBUG_LOG.md](./DEBUG_LOG.md) | Exhaustive test logs, CDP browser proofs, frame rate graphs, and soak test metrics. | ✅ Documented with proofs |

> 🛡️ **Windows SmartScreen Note:** The installer is unsigned (standard for hackathon projects). If Windows SmartScreen prompts on first launch, click **"More info"** → **"Run anyway"**.

---

## 🛑 The Problem

Modern knowledge workers face a quiet crisis at their desks:
1. **Ergonomic Blind Spots:** Prolonged computer work naturally pulls us into forward-head posture ("tech neck"), shoulder hunching, and reduced blink rates, leading to chronic eye strain, headaches, and physical fatigue.
2. **Intrusive Productivity Tools:** Traditional productivity tools demand full-screen attention, break deep-work state with disruptive popups, or log invasive keystrokes and screenshots.
3. **The Cloud AI Privacy Trap:** Contemporary "smart" companions stream your camera frames, audio, and personal work data to remote cloud servers, creating unacceptable privacy and security risks.

### The Solution: Notch Companion
Notch Companion bridges deep cognitive focus and physical health by living as an **ambient, non-distracting floating island at the top edge of your screen**. It runs all machine vision and posture rules **100% on your local hardware** using WebAssembly, ensuring that **zero bytes of video or telemetry ever leave your device**.

---

## ⚡ Verified Performance & Reliability Benchmarks (v1.0.4)

| Metric | Target / Spec | Measured Result | Verification Method |
| :--- | :--- | :--- | :--- |
| **Cold / Warm Boot Time** | < 1,500 ms | **~530 ms** | Logged via `BOOT_READY` marker in `%LOCALAPPDATA%\Notch\logs\app.log` |
| **Desktop Animation Frame Rate** | >= 60 FPS | **121.0 - 144.1 FPS** | In-WebView2 frame timing over Chrome DevTools Protocol (CDP) |
| **Jank / Dropped Frames** | 0 frames (> 50ms) | **0 jank frames** | Performance trace during repeated expand/collapse transitions |
| **Outbound Network Sockets** | Exactly 0 | **0 open TCP sockets** | `Get-NetTCPConnection -OwningProcess (Get-Process notch).Id` |
| **Continuous Soak Test** | >= 20 minutes | **20+ min continuous** | Flat ~38.6 MB WorkingSet memory, 0 memory leaks, 0 crashes |
| **Responsive Viewports** | 15 configurations | **90/90 checks PASS** | 1024x600 up to 1920x1080 at 100%, 125%, 150% DPI scaling |
| **Single-Instance Mutex** | Secondary exit 0 | **PASS (code 0)** | Native Win32 Mutex guard in `main.rs` before WebView2 init |

---

## 🛡️ The Four Critical Desktop Fixes (v1.0.4)

In the latest v1.0.4 release, four core desktop bugs were systematically diagnosed, patched, and proven:

1. **CRASH Immunity:**
   - *Problem:* App exited spontaneously without error dialogs when system close events triggered.
   - *Fix:* Intercepted Tauri 2's `RunEvent::ExitRequested` with an atomic `QUIT_REQUESTED` coordinator in Rust. Prevented window closure on frameless layered windows via `WindowEvent::CloseRequested => api.prevent_close()`. Coordinated graceful exits strictly through the system tray. Added panic logging to `%LOCALAPPDATA%\Notch\logs\app.log`.
2. **SCROLL & Cut-Off:**
   - *Problem:* Tabs lacked mouse-wheel scrolling; Focus tab buttons and active tasks were clipped on standard laptop screens.
   - *Fix:* Expanded natural layout heights to 350px in `VIEW_LAYOUTS`. Enabled `.card { overflow-y: auto; overflow-x: hidden; }` with sleek custom scrollbars. Eliminated nested clipping so mouse-wheel scrolling works fluidly across all tabs.
3. **POPUP Sanitization:**
   - *Problem:* Top-center hover occasionally triggered an empty placeholder or leftover legacy view.
   - *Fix:* Sanitized `openingView()` and `expand()` to strictly validate against the 6 canonical tabs (`focus`, `tasks`, `habits`, `wellbeing`, `insights`, `settings`), defaulting reliably to `"focus"`. Excised all legacy fallback views.
4. **SLOW START Elimination:**
   - *Problem:* App was delayed by a 4.9-second greeting sequence before revealing the interactive notch.
   - *Fix:* Removed the desktop greeting delay; `main.ts` now reveals the interactive collapsed pill immediately on launch (`island.fsm.reveal()`), cutting boot time down to ~530ms.

---

## 🏛️ System Architecture

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                   NOTCH COMPANION                                     │
├───────────────────────────┬─────────────────────────────┬─────────────────────────────┤
│      DESKTOP RUNTIME      │        OFFLINE VISION       │      WELLBEING ENGINES      │
│  (Tauri 2 + Rust + Win32) │    (@mediapipe/tasks-vision)│ (TypeScript Sliding Windows)│
├───────────────────────────┼─────────────────────────────┼─────────────────────────────┤
│ • Frameless transparent   │ • Pose Landmarker Lite WASM │ • 25m Focus / 5m Break FSM  │
│   top-center notch pill   │ • Face Landmarker WASM      │ • Active task pill binding  │
│ • Hover peek & expansion  │ • Bundled in /public/wasm/  │ • Forward-head / slouch calc│
│ • System tray & autostart │ • Zero external CDN calls   │ • Rolling 60s PERCLOS ratio │
│ • 0 open network sockets  │ • Volatile in-memory frames │ • 4 Guided micro-resets     │
└─────────────┬─────────────┴──────────────┬──────────────┴──────────────┬──────────────┘
              │                            │                             │
              ▼                            ▼                             ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                           CROSS-PLATFORM ADAPTER LAYER                                │
│                                   (platform.ts)                                       │
├───────────────────────────────────────────┬───────────────────────────────────────────┤
│          DESKTOP (IS_TAURI = true)        │         BROWSER (IS_TAURI = false)        │
├───────────────────────────────────────────┼───────────────────────────────────────────┤
│ • Win32 frameless window bounds           │ • Mock-desktop wallpaper canvas           │
│ • Tauri Single-Instance mutex guard       │ • In-page simulated notch pill            │
│ • Win32 native cursor polling             │ • Web Notification API + LocalStorage     │
│ • Native sound synthesis & autostart      │ • WebAudio pop/chime synthesis            │
└───────────────────────────────────────────┴───────────────────────────────────────────┘
```

---

## ✨ Key Features & The Three Modules

### Module 1: ⏱️ Deep Focus Engine & Tasks
- **Structured Work/Break Cycles:** 25-minute focus intervals with 5-minute restorative breaks (configurable).
- **Active Task Binding:** Attach your priority task to the timer; remaining time and title stay visible in the collapsed notch pill (`⏱️ 24:58 · Finish Presentation`).
- **Drift-Free Persistence:** State is timestamped and persisted so reboots never corrupt or double-count focus minutes.
- **Tasks Manager:** Create, prioritize (`Low`, `Medium`, `High`), filter (`Today`, `Upcoming`, `Overdue`), and complete tasks with one-tap activation.
- **Mochi Mascot Reactions:** Mochi smiles during focus sessions and reminds you when it's time to stretch.

### Module 2: 🧍 100% Offline Posture & Fatigue AI
- **Local Pose Landmarker (Lite):** Evaluates posture at ~5 FPS using bundled MediaPipe WebAssembly.
- **Biomechanical Metrics:**
  - **Slouch Ratio:** Vertical displacement of nose-to-shoulder midpoint relative to your baseline.
  - **Forward Head:** Horizontal offset of ear relative to shoulder, normalized by shoulder span.
  - **Shoulder Tilt:** Angle between shoulder landmarks.
- **One-Tap Calibration:** *"Sit straight, then press Calibrate"* sets your personalized ergonomic baseline.
- **Facial Fatigue & PERCLOS:** Tracks rolling blink closure ratio and prolonged closures (>1.5s). Outputs gentle suggestions (*"☕ You might be getting tired. Consider a short break"*). Never fabricates medical diagnoses.
- **Visible Privacy Indicator & Kill Switch:** Prominent pink dot glows when the camera is active. An instant **Pause/Disable** button immediately terminates the video track and shuts off the hardware camera LED.

### Module 3: 🌱 Habits & Guided Wellbeing Resets
- **Honest Streaks:** Missed days are **never auto-completed** and stay visible as missed. Includes a weekly 7-day dot completion matrix (`M T W T F S S`).
- **4 Guided Micro-Breaks:**
  - 👁️ **20-20-20 Eye Rest** (20s distant focal reset)
  - 🧘 **Desk Stretch** (60s neck, shoulder & chest opening)
  - 🧍 **Spine & Posture Reset** (30s spinal alignment)
  - 💧 **Hydration Check** (30s water refill)
- **Focus Deferral:** Holds non-critical break prompts during active focus sessions until the interval ends.
- **Insights & Daily Summary:** 4 provenance-tagged tiles (`Measured` vs `Estimated`), 7-day focus bar chart, and screen-time estimates labeled *"Sample data · Estimates only"*. Prominently displays: *"Descriptive insights, not a measure of productivity."*

---

## 🔒 Privacy & Security Guarantee

1. **Zero Network Calls:** Notch makes zero external requests. Tested and verified with **0 open TCP sockets** owned by the process.
2. **Zero Video Saved:** Camera frames are processed frame-by-frame in volatile GPU/CPU memory and immediately freed. No images, video recordings, or screenshots are ever written to disk or sent over a network.
3. **No Keystrokes or Screen Capture:** Notch never hooks keystrokes, clipboard buffers, or application contents.
4. **Offline Resilience:** Turn off your Wi-Fi, disconnect your Ethernet, and launch the app: timers, posture detection, habits, and tasks all continue working flawlessly.
5. **Completely Clean Architecture:** All legacy call recording, microphone/audio capture dependencies, and auxiliary windows have been 100% removed.

---

## 🧪 Automated Verification Suites

The repository includes a comprehensive, automated test matrix that judges and developers can execute locally:

```powershell
# 1. Desktop Judge Proof (Runs automated 10-point test over CDP on notch.exe)
node scripts/verify_desktop_judge_proof.mjs

# 2. Responsive Web Viewports (Verifies 15 resolution/scale configs across all 6 tabs)
node scripts/verify_web_viewports_after.mjs

# 3. Live Web E2E Suite (Verifies web demo, fake camera, timers, and storage)
node scripts/verify_e2e_web.mjs

# 4. Outbound Sockets Proof (Verifies zero network connections on running app)
Get-NetTCPConnection -OwningProcess (Get-Process notch).Id
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl+Shift+R</kbd> | **Hidden Demo Reset** (Restores clean presentation seed data) |
| <kbd>Ctrl+P</kbd> | **Pin / Unpin** Island (Keep panel open) |
| <kbd>1</kbd> | Jump to **Focus** view |
| <kbd>2</kbd> | Jump to **Tasks** view |
| <kbd>3</kbd> | Jump to **Habits** view |
| <kbd>4</kbd> | Jump to **Wellbeing** view |
| <kbd>5</kbd> | Jump to **Insights** view |
| <kbd>6</kbd> | Jump to **Settings** view |
| <kbd>Space</kbd> | Start / Pause Focus Timer (when on Focus tab) |
| <kbd>Esc</kbd> | Collapse Island |

---

## 🚀 Running Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust toolchain](https://rustup.rs/) (1.75+)
- WebView2 Runtime (pre-installed by default on Windows 10/11)

### Development (Desktop App)
```powershell
cd coucou-windows-v0.5.3/windows
npm install
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npx tauri dev
```

### Local Web Preview Server
```powershell
cd coucou-windows-v0.5.3/windows
npm run build
npm run preview
# Open http://localhost:4173 in any browser
```

### Build Production Installer (.exe)
```powershell
cd coucou-windows-v0.5.3/windows
npm run build
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npx tauri build
# Output located at: src-tauri/target/release/bundle/nsis/Notch-Windows-1.0.4-setup.exe
```

---

## 🎥 2-Minute Backup Demo Video & Presentation Script

In the event of hardware or Wi-Fi disruptions during judging, the full presentation walkthrough is documented in [**`DEMO_SCRIPT.md`**](./DEMO_SCRIPT.md).

### The 7-Step Hackathon Walkthrough Flow:
1. **The Ambient Notch (0:00 - 0:20):** Show the dark pill at the top of the screen. Hover cursor over the top edge to expand the 6-tab panel smoothly.
2. **Deep Focus Session (0:20 - 0:40):** Bind a task and start a 25-minute focus session. Collapse the notch to show the live timer pill (`⏱️ 24:58`).
3. **Offline Posture AI (0:40 - 1:10):** Enable camera analysis. Show the glowing pink privacy indicator. Sit straight and click **"Calibrate"**. Slouch forward to demonstrate the instant posture check and Mochi's worried reaction. Straighten up to show immediate recovery.
4. **Honest Habits & Insights (1:10 - 1:30):** Check off a daily habit to demonstrate honest streaks. Open the Insights tab to show measured data provenance vs estimated indicators.
5. **The Ultimate Offline Test (1:30 - 1:50):** **Turn off Wi-Fi live on stage.** Show that the focus timer, MediaPipe vision, and habit engine continue running without any hiccups.
6. **Privacy Kill Switch (1:50 - 2:00):** Click the camera **Pause/Disable** button. Show the indicator turning off and the webcam hardware LED extinguishing immediately.

---

## 🔧 Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Windows SmartScreen warning on launch** | Unsigned open-source hackathon binary. | Click **"More info"** → **"Run anyway"**. |
| **Nothing appears when launching installer or shortcut** | Another instance of `notch.exe` is already running in background. | The built-in Win32 single-instance mutex ensures only one copy runs. Look for the Notch icon in the system tray overflow menu (`^`), or close existing background processes: `Stop-Process -Name notch -Force`. |
| **"WebView2 Runtime not found" error** | Missing Microsoft Edge WebView2 runtime (common on older Windows 10 editions). | Windows 11 includes WebView2 by default. For Windows 10, download the free [Microsoft WebView2 Evergreen Bootstrapper](https://go.microsoft.com/fwlink/p/?LinkId=2124703). |
| **Log file inspection for debugging** | Need to see startup diagnosis or crash hooks. | Structured app logs and panic traces are written to `%LOCALAPPDATA%\Notch\logs\app.log`. |

---

## 🗺️ Deliberate Non-Goals & Roadmap

To maintain exceptional polish, rock-solid stability, and zero crashes, the following features were intentionally excluded from this release:
- **Cloud Sync & User Accounts:** Notch is unapologetically local-first. We do not require accounts, logins, or cloud databases.
- **Generative AI Chatbots:** We avoid hallucinating LLM chat interfaces in favor of fast, deterministic ergonomic rules.
- **Complex Calendar Integrations:** No OAuth or third-party web dependencies.

### Future Roadmap:
- Multi-monitor notch positioning selector.
- Custom ambient audio soundscapes (binaural focus waves, rain, white noise).
- CSV / JSON export for personal health analytics.

---

## 📚 Credits & MIT License

- **Coucou:** The desktop notch shell, window animation mechanics, and Mochi companion character are based on [Coucou](https://github.com/Louis-CFM/coucou) by Louis Raille (MIT License).
- **Google MediaPipe:** Vision models and WebAssembly runtime (Apache 2.0).
- **Tauri:** Safe, lightweight native desktop framework (MIT / Apache 2.0).

---

*Notch Companion is free and open-source software released under the [MIT License](https://github.com/jancherian/ergonotch/blob/main/LICENSE).*
