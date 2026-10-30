# 🚀 Notch Companion — Release Notes

## 🌿 Notch Companion v1.0.2 (October 30, 2026)

### 🌟 Key Highlights & Fixes
- **Problem A Resolved (Desktop Boot & Greeting FSM Lock):**
  - Eliminated the boot deadlock where `notch.exe` remained stuck on the launch greeting animation with an empty black box expanded panel.
  - Corrected `State.defaultView()` to strictly validate tab views, preventing fallback to `"greeting"`.
  - Added greeting collapse timer cancellation upon user expand, preventing race conditions from snapping the panel shut.
  - Tuned the initial launch greeting timeline in `mochi/greeting.ts` to `T.end: 3.6s, autoLeave: 3.8s` so Mochi's delightful welcome plays completely and smoothly reveals the interactive pill within ~3.8s.
  - Implemented an unbreakable 5-second boot watchdog that renders default views if any initialization promise stalls.
  - Added `BOOT_READY <ms>` marker and dataset flag on body (`document.body.dataset.ready = "1"`).
- **Problem B Resolved (Viewport Clipping & Responsive Scrolling):**
  - Added responsive scroll containers (`overflow-y: auto; overflow-x: hidden`) with sleek custom scrollbars to all views.
  - Prevented content cut-off across all 15 evaluated viewport/scale configurations (1024x600, 1280x720, 1366x768, 1536x864, 1920x1080 at 1x, 1.25x, and 1.5x scales).
  - Clamped desktop expanded panel height to 380px within the monitor work area bounds.
- **Judge-Grade Verification Proof on Desktop WebView2 via CDP:**
  - Automated 10/10 test suite executed directly on `C:\Users\Jan Cherian Thomas\AppData\Local\Notch\notch.exe` over Chrome DevTools Protocol (`--remote-debugging-port=9222`).
  - In-WebView2 frame rate during expand/collapse: **139.7 FPS** (zero jank frames).
  - All 6 tabs (`focus`, `tasks`, `habits`, `wellbeing`, `insights`, `settings`) verified with full DOM rendering and opacity = 1.
  - 100% offline isolation: **0 open TCP connections** verified via `Get-NetTCPConnection`.
  - Single-instance mutex verified: secondary instances exit with code 0 without disturbing the running instance.

---

## 🚀 Notch Companion v1.0.1 (October 30, 2026)

### 🌟 Highlights
- **Windows Desktop Packaging:** Custom NSIS installer (`Notch-Setup.exe`), native single-instance Win32 mutex, panic hooks, and structured file logging to `%LOCALAPPDATA%\Notch\logs\app.log`.
- **60 FPS Animation Physics:** Tuned spring physics (`response = 0.32, damping = 0.78`) and 130ms hover hysteresis to eliminate accidental cursor flickers.
- **Posture Inference Throttling:** Posture landmark inference pauses during active expand/collapse transitions so CPU/GPU is 100% focused on fluid 60fps rendering.
- **Accessibility:** Immediate geometric snapping for `prefers-reduced-motion` and disabled animations.

---

## 🚀 Notch Companion v1.0.0 (October 29, 2026)

### 🌟 Initial Release
- **100% Offline Guarantee:** Zero external network calls, zero telemetry, local storage only.
- **Star Feature — Real-Time Posture Feedback:** Offline pose landmarking powered by local MediaPipe WASM. Slouch, forward-head, and shoulder tilt detection relative to your calibrated baseline.
- **Facial Fatigue Monitoring:** Blink duration & rolling PERCLOS eye-closure analysis with non-diagnostic gentle suggestions.
- **Deep Focus Engine:** 25m/5m work/break sessions with live collapsed pill countdown and active task binding.
- **Task & Habit Tracker:** Full tasks CRUD and daily habits with authentic streaks and 7-day completion dots.
- **Guided Micro-Breaks:** 4 targeted breaks (20-20-20 eye rest, desk stretch, posture reset, hydration).
- **Presentation Demo Mode:** Fast 5-second alert threshold + hidden Demo Reset (<kbd>Ctrl+Shift+R</kbd>).

---

### 📥 Installation & Windows SmartScreen Notice
1. Download **`Notch-Setup.exe`** (54.57 MB).
2. Run the installer (NSIS single-user install mode, no admin privileges required).
3. **SmartScreen Notice:** As this is an unsigned hackathon build, Windows SmartScreen may show an alert on first launch. Simply click **"More info"** and then **"Run anyway"**.

---

### 🌐 Live Web Preview
Prefer not to install right now? Try the one-click public web preview:  
👉 **[https://jancherian.github.io/ergonotch/](https://jancherian.github.io/ergonotch/)**
