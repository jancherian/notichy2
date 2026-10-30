# 🌿 Notch Companion — Executive Project Summary

> **An ambient Windows desktop companion for deep focus, physical ergonomics, and daily wellbeing.**  
> Lives quietly at the top of your screen as a translucent dark island. 100% offline, zero telemetry, local-first.

---

## 🌟 Executive Overview

**Notch Companion** is a Windows 10/11 ambient companion designed to bridge cognitive deep work and physical ergonomics. Rather than demanding full-screen attention or interrupting with jarring modals, Notch floats quietly as a discrete dark island at the top-center edge of your screen. Hovering the top edge expands the island smoothly into a comprehensive focus, task, habit, and ergonomic cockpit.

All machine vision and posture analysis models run **100% locally on your hardware** via WebAssembly. **Zero bytes of video or personal telemetry ever leave your device.**

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
│ • Tauri Single-Instance guard             │ • In-page simulated notch pill            │
│ • Win32 native cursor polling             │ • Web Notification API + LocalStorage     │
│ • Native sound synthesis & autostart      │ • WebAudio pop/chime synthesis            │
└───────────────────────────────────────────┴───────────────────────────────────────────┘
```

---

## ✨ Feature Breakdown Across Core Modules

### 1. ⏱️ Focus Engine & Active Task Binding
- **Customizable Intervals:** 25-minute focus sprints with 5-minute restorative breaks.
- **Collapsed Pill Tracking:** Shrinks to a discrete top-center pill showing remaining time and the bound task title (`⏱️ 24:58 · Finish Presentation`).
- **Zero-Drift Persistence:** Timestamp-based session logging prevents time loss across app restarts or system sleeps.
- **Interruption Logging:** Counts pauses to give an accurate reflection of deep-work continuity.
- **Mochi Reactions:** Mochi companion smiles during focus sessions and reminds you when it's time to stretch.

### 2. 📋 Tasks Manager
- **Task Lifecycle:** Full CRUD with title, description, priority (`Low`, `Medium`, `High`), due dates, and due times.
- **Views & Filters:** `Today`, `Upcoming`, `Overdue`, `All`, and `Done`.
- **One-Tap Task Binding:** Click **"Set Active 🎯"** on any task to instantly bind it to the Focus timer.
- **No Duplicate Reminders:** Guarded with "last-fired" persistent timestamps.

### 3. 🧍 100% Offline Posture & Ergonomics AI *(Star Feature)*
- **On-Device Vision:** Uses local `@mediapipe/tasks-vision` Pose Landmarker running on CPU/GPU via WebAssembly.
- **Biomechanical Metrics:** Computes slouch ratio (nose-to-shoulder vertical offset), forward-head angle (ear-to-shoulder offset), and shoulder tilt angle.
- **Personalized Calibration:** One-tap baseline (*"Sit straight, then press Calibrate"*) sets your ideal posture profile.
- **Hold Threshold:** Requires bad posture to persist for 20 seconds (5s in Presentation Demo Mode) before triggering an alert to avoid false positives.
- **Privacy Kill Switch:** Pink camera indicator glows when active; an instant **Pause/Disable** button immediately terminates video tracks and extinguishes the hardware webcam LED.

### 4. 👁️ Facial Fatigue & PERCLOS Monitoring
- **Blink & Eye Closure Analysis:** Local Face Landmarker evaluates eye blendshapes (`eyeBlinkLeft`/`eyeBlinkRight`).
- **Rolling PERCLOS Ratio:** Tracks eye closure percentage over 60-second sliding windows and flags prolonged closures (>1.5s).
- **Non-Diagnostic Guidance:** Calibrated, non-alarmist suggestions (*"☕ You might be getting tired. Consider a short break"*). Never fabricates medical conclusions.
- **Independent Control:** Facial analysis can be toggled on/off independently of posture analysis.

### 5. 🌱 Honest Habits & Guided Micro-Breaks
- **Authentic Streaks:** Missed days are **never auto-completed** and stay visible as missed. Includes an interactive 7-day dot completion tracker (`M T W T F S S`).
- **4 Guided Physical Micro-Breaks:**
  - 👁️ **20-20-20 Eye Rest** (20s distant focal reset)
  - 🧘 **Desk Stretch** (60s neck, shoulder & chest opening)
  - 🧍 **Spine & Posture Reset** (30s spinal alignment)
  - 💧 **Hydration Check** (30s water refill)
- **Deep Work Deferral:** Holds non-critical break prompts during active focus sessions until the break period begins.

### 6. 📊 Insights & Daily Summary
- **Data Provenance Badges:** Clear tags distinguishing `Measured` data (focus minutes, completed tasks) from `Estimated` metrics (break adherence, screen time).
- **Interactive 7-Day Focus Chart:** Bar chart with hover tooltips and live highlight for today.
- **Core Philosophy:** Prominently displays: *"Descriptive insights, not a measure of productivity."*

### 7. ⚙️ Settings, Privacy & Presentation Polish
- **9 Control Toggles:** Autostart at sign-in, camera analysis, facial analysis, usage tracking, UI animations, notification frequency, hover sensitivity, collapse delay, and presentation demo mode.
- **Presentation Demo Mode:** Shortens posture hold warnings to 5 seconds for rapid live demonstration.
- **Hidden Demo Reset (<kbd>Ctrl+Shift+R</kbd>):** Instantly resets the app with clean, realistic seed data.
- **Danger Zone Wipe:** Complete local storage purge with safety confirmation modal.

---

## 🔒 Privacy & Offline Guarantee

| Guarantee | How It Is Achieved |
| :--- | :--- |
| **0 Outbound Network Sockets** | Verified via PowerShell: `Get-NetTCPConnection -OwningProcess (Get-Process notch).Id -ErrorAction SilentlyContinue` returns 0 open TCP connections. |
| **Zero Video Saved** | Video frames from `getUserMedia` are processed in volatile memory and discarded immediately. No images or clips are ever saved or transmitted. |
| **Local WASM Inference** | Pre-bundled `.task` models (Lite Pose & Face Landmarker) and WASM binaries run directly in the WebView2 sandbox. |
| **No Keystrokes or Screen Capture** | Notch never inspects clipboard contents, keystrokes, or background application windows. |
| **Offline Resilience** | Disconnecting Wi-Fi does not degrade any feature; timers, vision models, tasks, and habits continue functioning smoothly. |

---

## 📦 Evaluation Deliverables

| Deliverable | URL / Path | Status |
| :--- | :--- | :--- |
| **🚀 Public Live Web Demo** | [https://jancherian.github.io/ergonotch/](https://jancherian.github.io/ergonotch/) | ✅ Live & verified (10/10 PASS) |
| **📖 Product Landing Page** | [https://jancherian.github.io/ergonotch/about.html](https://jancherian.github.io/ergonotch/about.html) | ✅ Live & functional |
| **📦 Windows Installer (.exe)** | [GitHub Releases v1.0.4](https://github.com/jancherian/ergonotch/releases/tag/v1.0.4) | ✅ Published `Notch-Setup.exe` (v1.0.4) |
| **⚙️ GitHub Actions Workflow** | [`.github/workflows/release.yml`](.github/workflows/release.yml) | ✅ Configured for tag triggers |
| **💻 Local Desktop App** | `notch.exe` (Windows 10/11 x64) | ✅ Verified single-instance & offline |
| **📁 Packaged Installer** | [`coucou-windows-v0.5.3/windows/release/Notch-Setup.exe`](./coucou-windows-v0.5.3/windows/release/Notch-Setup.exe) | ✅ NSIS installer built & verified |
| **🎬 Presentation & Demo Script** | [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) | ✅ Ready for judges |
| **📚 Full Documentation** | [`README.md`](./README.md) | ✅ Updated & verified |

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

## 🚀 How to Set Up & Run

### 1. One-Click Windows Install
- Download and run [`Notch-Setup.exe`](https://github.com/jancherian/ergonotch/releases/download/v1.0.4/Notch-Setup.exe).
- *Windows SmartScreen note:* Click **"More info"** → **"Run anyway"**.
- The notch appears at the top-center of your screen immediately.

### 2. Live Web Demo (Zero Install)
- Open [https://jancherian.github.io/ergonotch/](https://jancherian.github.io/ergonotch/) in Chrome, Edge, or Firefox.
- In-browser MediaPipe WASM posture analysis runs directly on your local device via `getUserMedia`.

### 3. Run from Source Code (Developer Mode)
```powershell
cd coucou-windows-v0.5.3/windows
npm install
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npx tauri dev
```

---

## 📚 Credits & Licenses

- **Coucou:** Desktop notch shell, window mechanics, and Mochi mascot based on [Coucou](https://github.com/Louis-CFM/coucou) by Louis Raille (MIT License).
- **Google MediaPipe:** Computer vision models and WebAssembly runtime (Apache 2.0).
- **Tauri Framework:** Safe, lightweight native desktop runtime (MIT / Apache 2.0).

