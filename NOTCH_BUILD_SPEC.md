# NOTCH COMPANION: MASTER BUILD SPEC (for the coding agent)

> HOW TO USE: Put this file in the project root. Tell your coding agent:
> **"Read NOTCH_BUILD_SPEC.md fully. Do Stage 0 now. After each stage, run the app, tell me what works, then wait for me to say 'next'."**
> This keeps each prompt tiny, so you don't burn limits re-explaining anything.

---

## 0. What we are building

A Windows 10/11 desktop companion that lives as a small dark pill at the top-center of the screen. Hovering the top edge expands it into a compact panel with: focus timer, tasks + reminders, habits with streaks, a daily summary, wellbeing break prompts, and **camera-based posture feedback**.

**It is a hackathon demo, so it must look polished and never crash.** Working and impressive beats complete.

Hard rules from the product spec:
- **Fully offline.** No network calls, no accounts, no cloud AI, no API keys. Every model/asset is bundled locally.
- **Local-first privacy.** Camera frames processed locally, never saved or sent. Camera is opt-in, with a visible "camera active" indicator and an instant pause/disable button.
- **Honest wellbeing.** Never diagnose. Poor visibility gives "unavailable / low confidence", never a fabricated result. Suggest rest only.
- **Single instance**, system tray icon, optional launch at sign-in, one-click installer.

---

## 1. Tech stack (decided, do not change unless Stage 0 fails)

| Layer | Choice |
|---|---|
| Base | **Fork of Coucou's Windows app** (github.com/Louis-CFM/coucou, folder `windows/`, Tauri 2, MIT license). It already provides the frameless top-edge notch, hover-peek, expand animation, and the "Mochi" character. |
| UI | Use the frontend framework already in `windows/`. Add new panels there. If it is plain JS/TS, add Tailwind only if easy; do not rewrite. |
| Animation | Reuse Coucou's existing notch animation. Framer Motion only if the frontend is already React. |
| Data | `tauri-plugin-store` (JSON). Upgrade to SQLite via `tauri-plugin-sql` only if everything else is done. |
| Posture/fatigue | `@mediapipe/tasks-vision` (JS) running in the webview with `getUserMedia`. Pose Landmarker (lite) + Face Landmarker (blendshapes for eye closure). WASM + `.task` model files **bundled locally** in `public/`. |
| Rules engine | Plain TypeScript functions with a sliding time window. |
| Reminders | Timers + stored timestamps + `tauri-plugin-notification`. |
| Auto-start / single instance | `tauri-plugin-autostart`, `tauri-plugin-single-instance`, built-in tray. |
| Installer | Coucou's existing pack script (`npm run pack` inside `windows/`, output in `windows/release/`). Rename the product and installer to "Product-Setup.exe" or the final name. |

**Fallback (use ONLY if Tauri/Rust/MSVC setup fails and cannot be fixed fast):** switch to Electron + React + TypeScript + Tailwind, copying only Coucou's animation/CSS/Mochi assets. Use `electron-builder` (NSIS) for the installer. Tell me before switching.

---

## 2. Working rules for the agent

1. **One stage at a time.** Run the app after each stage and report what works. Wait for "next".
2. **If anything blocks you for more than ~3 attempts, switch to the simpler option** (see the Simplify list) and tell me. Don't spiral.
3. **Never add network calls.** Remove or disable anything in the base project that talks to the internet (see Stage 0).
4. **Seed demo data** where noted so every screen looks alive in the presentation.
5. **Keep the UI compact**: cards and tabs, immediate actions over charts. Dark pill, restrained purple/pink accents.
6. **Don't touch what works.** Make small edits, not rewrites.
7. **Keep the MIT license file and add credit to Coucou** in the README and an About line in Settings.
8. **No crash policy:** wrap camera, notifications, and storage in try/catch. Any failure shows a calm message and the rest of the app keeps working.
9. Keep code readable and commented lightly, because I'll need to explain it to judges.

---

## 3. Stages

### Stage 0: Get the base running and clean it
- Explore `windows/` and summarize the structure in 10 lines (frontend framework, where the notch window is configured, where the expanded panel UI lives, where the animation is, where Mochi is).
- Install deps and run the dev build. Tell me exact commands you used.
- **Remove or disable all network-dependent features:** Claude chat, API key storage, integrations (Stripe, n8n, GitHub, Vercel, Resend, Notion, Cal.com), Claude Code session hooks, WhatsApp, update checks, analytics. Keep the notch shell, animation, Mochi, sounds, tray.
- Rename the app to the working name **"Notch"** (placeholder) everywhere user-visible.
- Confirm: app launches, notch appears top-center, hover expands it, collapse works, tray icon works, only one instance can run.

### Stage 1: Panel layout with tabs
Expanded panel with tabs (icons + short labels): **Focus · Tasks · Habits · Wellbeing · Insights · Settings**. Overview strip at top shows the active task and timer if running. Switching tabs is smooth. Stay expanded while the user interacts; collapse after a configurable delay when the cursor leaves; support a pin button. Empty states look good.

### Stage 2: Focus timer
- Start / pause / resume / stop. Configurable work and break minutes (defaults 25/5).
- Optionally attach a task. Show active task + remaining time in the **collapsed** pill too.
- Pausing stops the active-time counter. Persist state with timestamps so a restart does not corrupt or double-count time.
- On finish: notification + "Take a break?" prompt. Log the completed session (duration, interruptions = number of pauses).

### Stage 3: Tasks + reminders
- Create/edit/complete/delete tasks: title, description, priority (low/med/high), due date/time.
- Today view + upcoming + overdue highlighted. Mark complete.
- Reminders: one-time and simple recurring (daily / selected weekdays). Native Windows notification at due time.
- **No duplicate reminders** after restart or resume (store "last fired" timestamp per reminder).
- Seed 4-5 demo tasks on first run.

### Stage 4: Posture detection (the demo's star feature)
Build a `postureEngine` module + a Wellbeing tab.
- **Opt-in:** camera is OFF by default. A clear "Enable camera analysis" toggle with a one-line privacy note ("Processed on this device. Nothing is saved or sent.").
- **Camera-active indicator:** a visible red/pink dot in the collapsed pill and in the panel whenever the camera is on. A big **Pause/Disable** button that stops all tracks and releases the camera immediately.
- Use `@mediapipe/tasks-vision` Pose Landmarker (lite model). **Bundle the WASM files and `.task` model in `public/`, and load them from local paths only.** Verify it works with Wi-Fi off.
- Run inference at a low configurable rate (default ~5 fps) in a requestAnimationFrame/timeout loop, throttled, so the UI never janks. Stop the loop entirely when disabled or the panel/camera is paused.
- Metrics from landmarks (use only when landmark visibility is above a threshold):
  - **Forward head:** horizontal offset of ear relative to shoulder, normalized by shoulder width.
  - **Shoulder tilt:** angle of the line between shoulders.
  - **Slouch/lean:** vertical distance nose to shoulder midpoint, relative to a calibrated baseline.
- **Calibration button:** "Sit straight, then press Calibrate" stores a baseline for the user.
- **Persistence rule:** show a posture warning only if bad posture holds for N seconds (default 20 s; add a "Demo mode" toggle that sets it to 5 s so it triggers fast on stage).
- **Low confidence handling:** if landmarks are missing or visibility is low, show "Posture: unavailable (low visibility)". Never guess.
- Sensitivity + reminder frequency sliders in Settings. Cooldown between warnings so it doesn't nag.
- **Mochi reacts:** good posture = happy/calm, bad posture = slouchy/worried, camera off = idle, unavailable = neutral. Also show a simple status chip: Good / Needs attention / Unavailable.
- Camera permission denied or no camera: show a friendly message; the rest of the app keeps working.

### Stage 5: Fatigue indicators (lightweight, optional toggle)
- Add Face Landmarker with blendshapes (`eyeBlinkLeft`/`eyeBlinkRight`); bundle its model locally too.
- Track **eye-closure duration** (closed longer than ~1.5 s repeatedly, or a high PERCLOS-style ratio over the last minute).
- Combine in a tiny rule engine with: **time since last break** and **continuous computer-use time**.
- Output only a soft suggestion: "You might be getting tired. Consider a short break." **Never say "fatigued", "drowsy" as a diagnosis, and never medical wording.** Missing signals = no conclusion.
- Separate toggle: "Facial analysis" can be disabled independently of posture.

### Stage 6: Wellbeing break prompts
- Guided short prompts: eye rest (20-20-20), stretch, posture reset, water. Configurable interval (default 45 min).
- Snooze (5 min), dismiss, and pause-all controls. Don't re-notify while a prompt is open.
- During an active focus session, hold non-critical prompts until the session ends or a break begins.
- Log break events (for the Insights tab).

### Stage 7: Habits + streaks
- Create habits (name, daily or selected weekdays). One-tap complete for today.
- Current streak + best streak + weekly completion (7-dot row). Pause/archive.
- Missed days are **never auto-completed** and stay visible as missed.
- Seed 3 demo habits (Read, Stretch, Drink water) with believable past history so streaks show.

### Stage 8: Insights / daily summary
- Cards: focus minutes today, tasks done vs planned, habits done, breaks taken, a small 7-day bar chart.
- Label clearly: measured activity vs estimates. Include the line: "Descriptive insights, not a measure of productivity."
- Foreground-app/screen-time: **optional**. If it's quick, implement a Rust command using the Windows API (GetForegroundWindow + idle time) with no keystroke or screenshot capture. If not quick, show seeded demo data labeled "sample data" and move on.

### Stage 9: Settings + privacy
- Toggles: launch at sign-in, camera analysis, facial analysis, usage tracking, animations on/off, notification frequency, hover zone sensitivity, collapse delay, demo mode.
- "Delete all my data" button with confirmation.
- Privacy statement text: offline, local storage only, no video saved, no keystrokes, no screenshots.

### Stage 10: Polish for the presentation
- Smooth transitions, consistent spacing, purple/pink accents on a dark translucent pill, readable contrast, keyboard-accessible controls, labels on icon buttons.
- Add a hidden **"Demo reset"** (e.g. Ctrl+Shift+R) that restores clean seed data.
- Verify: no console errors, no network requests (open devtools network tab and confirm zero), camera light turns OFF when disabled.
- Test at 100% and 150% display scaling, and on a second monitor if available.

### Stage 11: Build installer and verify
- Run the pack/build command. Output the installer as `Product-Setup.exe` (or final name).
- Installer: Start Menu shortcut, optional desktop shortcut, optional launch at sign-in, uninstaller, no admin rights if possible.
- Test on this machine: install, launch, reboot or sign out/in (auto-start), uninstall.
- **Offline test:** disable Wi-Fi, then confirm timer, tasks, habits, and posture detection all work.
- Write a short `README.md`: what it is, features, privacy, how to run, credit to Coucou (MIT).

---

## 4. Simplify list (use these shortcuts when stuck)

- SQLite → JSON store.
- Foreground app tracking → seeded "sample data".
- Recurring reminders → daily only.
- Fatigue → eye-closure + time-since-break only.
- Charts → simple CSS bars.
- Pose model fails to load → try lite model + different WASM path; last resort: face-only mode (head tilt/position).
- Camera permission prompt problems in the webview → ensure the webview permission is granted by default for camera in the Tauri/WebView2 config; if still failing, tell me the exact error.

## 5. Deliberately NOT building (mention as "roadmap" in the pitch)

Time blocking editor, complex routines/workflow builder, Do Not Disturb control, ambient audio, backup/restore, advanced analytics, cloud or multi-device sync, natural-language task creation, AI recommendations.

---

## 6. Demo script (build so this exact flow works flawlessly)

1. Show the tiny pill at the top. Hover, and it expands smoothly.
2. Start a 25-min focus session on a task. Show it in the collapsed pill.
3. Enable the camera, show the camera-active indicator, then calibrate.
4. Slouch, and the posture warning triggers with Mochi reacting. Straighten up, and it recovers.
5. Complete a habit and show the streak updating. Open the Insights card.
6. **Turn Wi-Fi off live** and show everything still works. Point out that no data leaves the device.
7. Press the camera Pause button and show the indicator going off.

---

## 7. Definition of done

- [ ] Launches on Windows with the notch at top-center and hover expansion
- [ ] Tray icon, single instance, optional auto-start
- [ ] Focus timer, tasks, reminders (no duplicates), habits + streaks all persist after restart
- [ ] Camera posture feedback works offline, with indicator, pause button, calibration, and low-confidence state
- [ ] Break prompts with snooze/dismiss
- [ ] Insights card + clear privacy settings
- [ ] Zero network requests; installer works; README + Coucou MIT credit included
- [ ] The demo script runs end to end without errors

---

## 8. EVALUATION REQUIREMENT: must be a working model beyond local dev setup

The judges require a working model that goes beyond "runs on the developer's machine". Deliver ALL THREE of the following. Do Stage 12A right after Stage 4 (so a live link exists early), and 12B/12C after Stage 10.

### Stage 12A: Public live web demo (hosted URL)
The UI is web tech, so ship the same frontend as a hosted static site that judges can open with one click, no install.
- **Create a platform adapter first** (`platform.ts`) that wraps everything desktop-only: storage, notifications, autostart, tray, window control. Two implementations:
  - `isTauri === true` → use Tauri plugins (store, notification, autostart).
  - Otherwise (browser) → use `localStorage` and the Web Notification API; skip tray/autostart/single-instance.
- In the browser, render the notch as a simulated pill at the top-center of the page, over a plain mock-desktop background, so the hover/expand animation still shows.
- Camera posture detection must work in the browser via `getUserMedia` (hosted sites are HTTPS, which satisfies the requirement). Serve the MediaPipe WASM and `.task` files from the **same origin** (in `public/`), with no CDN calls, so the offline claim stays true.
- Add a small banner: "Web preview. Install the desktop app for the system-wide notch, tray, and launch at sign-in."
- Build with `npm run build` and deploy to **Vercel, Netlify, or GitHub Pages** (whichever is fastest). Put the live URL in the README.
- Confirm the deployed site works on a fresh browser profile and the camera permission prompt appears.

### Stage 12B: Downloadable installer from a public release
- Add a **GitHub Actions workflow** using `tauri-apps/tauri-action` on `windows-latest` that builds the installer when a version tag (e.g. `v1.0.0`) is pushed, and attaches `Product-Setup.exe` to a **GitHub Release**. This means no dependence on my laptop's build environment.
- The installer is unsigned, so Windows SmartScreen may warn. Document in the README: "Click 'More info' then 'Run anyway'."
- Verify by downloading the installer FROM the release page on a clean machine or VM (not from the build folder), installing it, and running the demo flow.
- If CI fails and time is short, build locally and upload the `.exe` to a GitHub Release by hand.

### Stage 12C: Landing page + README + backup demo video
- A single-page landing site (can live at the root of the hosted demo, or a `/about` route) with: one-line pitch, the 3 modules, an animated GIF or screenshot of the notch, **two buttons: "Try live demo" and "Download for Windows"**, a privacy/offline section, and the Coucou MIT credit.
- `README.md` with: problem, features, architecture diagram (simple), tech stack, how to run locally, live demo link, download link, SmartScreen note, privacy statement, limitations/roadmap.
- Record a **2-minute backup demo video** following the demo script, in case the live camera or Wi-Fi demo fails during judging. Link it in the README.

### Updated definition of done (adds to Section 7)
- [ ] Live public URL works in a fresh browser with camera posture detection
- [ ] GitHub Release contains a working `Product-Setup.exe` that installs on a clean Windows machine
- [ ] README has live link, download link, screenshots, privacy, and credits
- [ ] Backup demo video recorded and linked
