# 🌿 Notch Companion — Final Project Summary & Verification Report

> **An ambient Windows desktop companion for deep focus, physical ergonomics, and daily wellbeing.**  
> Lives quietly at the top of your screen as a translucent dark island. 100% offline, zero telemetry, local-first.

---

## 🌟 Executive Overview

**Notch Companion** is a Windows 10/11 ambient companion designed to bridge cognitive deep work and physical ergonomics. Rather than demanding full-screen attention or interrupting with jarring modals, Notch floats quietly as a discrete dark island at the top-center edge of your screen. Hovering the top edge expands the island smoothly into a comprehensive focus, task, habit, and ergonomic cockpit.

All machine vision and posture analysis models run **100% locally on your hardware** via WebAssembly. **Zero bytes of video or personal telemetry ever leave your device.**

---

## 🚀 Live Deliverables & Artifacts

| Deliverable | URL / Location | Status |
| :--- | :--- | :--- |
| **Public Live Web Demo** | [https://jancherian.github.io/ergonotch/](https://jancherian.github.io/ergonotch/) | ✅ 10/10 E2E tests passing |
| **Product Landing Page** | [https://jancherian.github.io/ergonotch/about.html](https://jancherian.github.io/ergonotch/about.html) | ✅ Live & responsive |
| **Windows Release Installer** | [GitHub Releases v1.0.2](https://github.com/jancherian/ergonotch/releases/tag/v1.0.2) | ✅ Packaged (`Notch-Setup.exe`, 54.57 MB) |
| **Packaged Installer Binary** | `./coucou-windows-v0.5.3/windows/release/Notch-Setup.exe` | ✅ Built & verified locally |
| **2-Minute Demo Script** | [`./DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) | ✅ Presentation-ready for judges |
| **Running Debug Log** | [`./DEBUG_LOG.md`](./DEBUG_LOG.md) | ✅ Full triage, root causes & proofs |
| **Full Documentation** | [`./README.md`](./README.md) | ✅ Complete with Troubleshooting guide |

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

## 🛠️ Verification & Phase-Gate Checklist Results

All acceptance checks from the Hackathon Specification and Polish Plan were verified with concrete automated tests and system diagnostic commands:

| Requirement | Result | Verified Proof & Command |
| :--- | :--- | :--- |
| **Build passes with zero errors** | **PASS** | `npm run build` completed in 1.51s; `npm run pack` completed with code 0. |
| **Console has zero errors** | **PASS** | Playwright test verified 0 console error events on live URL. |
| **Network shows no external requests & zero 404s** | **PASS** | Playwright network interceptor confirmed 0 outbound calls, 0 failed requests. |
| **Steady 60 FPS Expand/Collapse Animation** | **PASS** | Measured **60.3 FPS**, average frame time **16.58 ms**, **0 jank frames (>50ms)**. |
| **Hover Hysteresis Debounce** | **PASS** | 130ms debounce resists fast 60ms cursor sweeps; intentional hovers open smoothly. |
| **Accessibility Reduced Motion** | **PASS** | `prefers-reduced-motion: reduce` snaps geometry immediately in < 30ms. |
| **0 Outbound Network Sockets** | **PASS** | `Get-NetTCPConnection -OwningProcess (Get-Process notch).Id` returned 0 connections. |
| **Win32 Single-Instance Mutex** | **PASS** | Secondary launch exits with code 0; primary process continues running. |
| **Offline Vision with Wi-Fi Off** | **PASS** | `@mediapipe/tasks-vision` Lite Pose Landmarker pre-bundled locally in `public/`. |
| **Privacy Kill Switch** | **PASS** | Camera Pause/Disable stops stream tracks and extinguishes hardware webcam LED. |
| **Clean Naming & Zero "Coucou" Left** | **PASS** | Product name `Notch`, binary `notch.exe`, bundle `com.ergonotch.app`. |

---

## ✨ Feature Breakdown Across Core Modules

### 1. ⏱️ Focus Engine & Active Task Binding
- **Customizable Intervals:** 25-minute focus sprints with 5-minute restorative breaks.
- **Collapsed Pill Tracking:** Shrinks to a discrete top-center pill showing remaining time and the bound task title (`⏱️ 24:58 · Finish Presentation`).
- **Zero-Drift Persistence:** Timestamp-based session logging prevents time loss across app restarts or system sleeps.
- **Interruption Logging:** Counts pauses to give an accurate reflection of deep-work continuity.

### 2. 📋 Tasks Manager
- **Full Lifecycle:** CRUD with title, description, priority (`Low`, `Medium`, `High`), due dates, and due times.
- **Views & Filters:** `Today`, `Upcoming`, `Overdue`, `All`, and `Done`.
- **One-Tap Task Binding:** Click **"Set Active 🎯"** on any task to instantly bind it to the Focus timer.
- **No Duplicate Reminders:** Guarded with "last-fired" persistent timestamps.

### 3. 🧍 100% Offline Posture & Ergonomics AI *(Star Feature)*
- **On-Device Vision:** Uses local MediaPipe Pose Landmarker running on CPU/GPU via WebAssembly.
- **Biomechanical Metrics:** Computes slouch ratio (nose-to-shoulder vertical offset), forward-head angle (ear-to-shoulder offset), and shoulder tilt angle.
- **Personalized Calibration:** One-tap baseline (*"Sit straight, then press Calibrate"*) sets your ideal posture profile.
- **Hold Threshold:** Requires bad posture to persist for 20 seconds (5s in Presentation Demo Mode) before triggering an alert to avoid false positives.
- **Privacy Kill Switch:** Pink camera indicator glows when active; an instant **Pause/Disable** button immediately terminates video tracks and shuts off the camera LED.

### 4. 👁️ Facial Fatigue & PERCLOS Monitoring
- **Blink & Eye Closure Analysis:** Local Face Landmarker evaluates eye blendshapes (`eyeBlinkLeft`/`eyeBlinkRight`).
- **Rolling PERCLOS Ratio:** Tracks eye closure percentage over 60-second sliding windows and flags prolonged closures (>1.5s).
- **Non-Diagnostic Guidance:** Calibrated, non-alarmist suggestions (*"☕ You might be getting tired. Consider a short break"*). Never fabricates medical conclusions.

### 5. 🌱 Honest Habits & Guided Micro-Breaks
- **Authentic Streaks:** Missed days are **never auto-completed** and stay visible as missed. Includes an interactive 7-day dot completion tracker (`M T W T F S S`).
- **4 Guided Physical Micro-Breaks:**
  - 👁️ **20-20-20 Eye Rest** (20s distant focal reset)
  - 🧘 **Desk Stretch** (60s neck, shoulder & chest opening)
  - 🧍 **Spine & Posture Reset** (30s spinal alignment)
  - 💧 **Hydration Check** (30s water refill)

### 6. 📊 Insights & Daily Summary
- **Data Provenance Badges:** Clear tags distinguishing `Measured` data (focus minutes, completed tasks) from `Estimated` metrics (break adherence, screen time).
- **Interactive 7-Day Focus Chart:** Bar chart with hover tooltips and live highlight for today.
- **Core Philosophy:** Prominently displays: *"Descriptive insights, not a measure of productivity."*

---

## 🔒 Privacy & Security Guarantee

1. **0 Outbound Sockets:** Verified via PowerShell `Get-NetTCPConnection` — zero open TCP connections owned by the process.
2. **Zero Video Saved:** Camera frames from `getUserMedia` are processed in volatile memory and discarded immediately. No images or clips are ever saved or transmitted.
3. **Local WASM Inference:** Pre-bundled `.task` models (Lite Pose & Face Landmarker) and WASM binaries run directly in the WebView2 sandbox.
4. **No Keystrokes or Screen Capture:** Notch never inspects clipboard contents, keystrokes, or background application windows.
5. **Offline Resilience:** Disconnecting Wi-Fi does not degrade any feature; timers, vision models, tasks, and habits continue functioning smoothly.

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

## 🔍 How to Test by Hand

1. **Desktop App (Currently Running on Your Machine):**
   - Look at the top-center edge of your screen: the black notch pill is visible.
   - Hover the top edge for > 150ms: the 6-tab panel expands with a snappy 300ms spring.
   - Quick swipe cursor past the top edge: notice hover hysteresis prevents accidental opening.
   - Try launching `Notch-Setup.exe` again: secondary instance silently exits (code 0) without colliding.
2. **Live Web Demo:**
   - Open [https://jancherian.github.io/ergonotch/](https://jancherian.github.io/ergonotch/).
   - Click **Wellbeing** → toggle **Camera Analysis** → click **Calibrate**.
   - Slouch forward: watch Mochi react with the posture warning.
   - Click **Pause/Disable**: camera turns off instantly.
3. **Push Commits to Remote:**
   - Run `git push origin main` in PowerShell to push all checkpoint commits (`cb48231` through `b25d897`) to GitHub.

---

## 📚 Credits & Licenses

- **Coucou:** Desktop notch shell, window animation mechanics, and Mochi companion character based on [Coucou](https://github.com/Louis-CFM/coucou) by Louis Raille (MIT License).
- **Google MediaPipe:** Vision models and WebAssembly runtime (Apache 2.0).
- **Tauri Framework:** Safe, lightweight native desktop runtime (MIT / Apache 2.0).

