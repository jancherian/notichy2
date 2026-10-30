# NOTCH DEBUG + POLISH + DEPLOY PLAN (for the coding agent)

> **Written for Google Antigravity.**
> HOW TO USE: Put this file in the project root next to NOTCH_BUILD_SPEC.md, then create the small `AGENTS.md` shown below so Antigravity reads these files automatically in every new chat. That saves you from re-pasting prompts and burning limits.
> First prompt to send: **"Read DEBUG_AND_POLISH_PLAN.md fully. Start with Part 1, then do Part 3. After each Part, run the verification checks, report results, and wait for me to say 'next'."**

### Create `AGENTS.md` in the project root (Antigravity reads it automatically)
```
# Project rules
- This is the Notch Companion hackathon app (Tauri 2 desktop + browser demo, fully offline, no network calls).
- Read NOTCH_BUILD_SPEC.md and DEBUG_AND_POLISH_PLAN.md before starting any task.
- Never claim something is fixed without proof (screenshot, log line, or passing test).
- Run the build and check console + network after every change.
- Only edit files inside the scope you were given. Commit a git checkpoint before large changes.
- Never add network calls or telemetry.
```
`AGENTS.md` is the cross-tool rules format. A `GEMINI.md` in the root is Antigravity-only and takes precedence if both exist, so use `GEMINI.md` only if you need Antigravity-specific overrides.

## Known problems (from the project summary)

1. The downloaded `Notch-Setup.exe` was run and **nothing happened**.
2. The live web demo at `https://jancherian.github.io/ergonotch/` **does not work properly**.
3. Animations are not smooth enough.
4. Product is still named `coucou.exe` internally. Judges will see that in Task Manager.
5. The summary file contains `file:///c:/Users/...` links and a local PID. These are broken for anyone else.

## Priority order (stop when time runs out; each part leaves a working state)

1. Web demo fixed and redeployed (judges open this first)
2. Installer fixed and re-released
3. Animation smoothness
4. Cleanup of docs, naming and the final clean-machine test

---

## PART 1: Tools to set up first (5 minutes)

### Cloudflare (use it to host the web demo)
Cloudflare Pages avoids GitHub Pages subpath problems (the app is served at the site root) and lets you set response headers.

Install the Cloudflare skills from your project root in the terminal:
```
npx skills add https://github.com/cloudflare/skills
```
If the installer asks which agent to install for, choose Antigravity. Antigravity loads skills from `.agent/skills/<skill-name>/SKILL.md` (project) or `~/.gemini/antigravity/skills/<skill-name>/` (global). If the installer put the files somewhere else, copy the skill folders (especially `wrangler`) into `.agent/skills/` and restart Antigravity.

This gives the agent Cloudflare's skills, including the `wrangler` skill for deploys. Cloudflare also publishes MCP servers, including a **Browser Run** server (`https://browser.mcp.cloudflare.com/mcp`) that can open a URL and screenshot it, which is useful for checking the live site. Adding an MCP server is optional; add it through Antigravity's MCP settings if you want it. The skill and the `wrangler` CLI are enough for deploying.

You can deploy without the skill too: `npx wrangler login`, then `npx wrangler pages deploy dist --project-name ergonotch`.

### Playwright (use it to test automatically)
Install `@playwright/test` and Chromium (`npx playwright install chromium`). Launch Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` so the camera flow can be tested with a fake webcam and no prompt. Use it to check console errors, failed network requests, and screenshots of the live URL.

### Parallel agents (Antigravity Agent Manager)
See Part 7. Do not run parallel agents on the same files.

---

## PART 2: Debug rules (apply at EVERY stage)

After every change the agent must:
1. Run the build (`npm run build`, and for desktop `npx tauri build --debug` when touching desktop code). Fix all errors and warnings that matter.
2. Open the app and check the **console: zero errors**.
3. Check the **Network tab: zero requests to other domains**, and zero failed (404) local asset requests.
4. Exercise the feature just built (click through it). Report what was observed, not what was assumed.
5. If a bug takes more than 3 attempts: stop, state the root-cause hypotheses, add logging, and test one hypothesis at a time. Do not make random edits.
6. Never claim "fixed" without proof (a screenshot, a log line, or a passing test).

---

## PART 3: FIX THE LIVE WEB DEMO (do this first)

### 3.1 Find out what is actually broken (diagnose before changing anything)
Open the deployed URL in Playwright/Chromium and record: console errors, failed requests, and a screenshot. Likely causes, check each:

- **Wrong base path.** GitHub Pages serves from `/ergonotch/`. If Vite `base` is `/` then JS/CSS/WASM/model files 404. Fix: set `base: './'` in `vite.config`.
- **Hard-coded absolute asset paths** like `/wasm/...` or `/models/...` for MediaPipe. These break on a subpath. Compute them from `import.meta.env.BASE_URL` (or `new URL('wasm/', document.baseURI)`) and pass that to `FilesetResolver.forVisionTasks(...)`.
- **Tauri APIs called in the browser** (`@tauri-apps/api`, plugins) throwing errors. All of them must go through `platform.ts` and be skipped when `IS_TAURI` is false. Search the code for direct imports of `@tauri-apps` outside `platform.ts`.
- **Camera in the browser:** needs HTTPS (fine on Pages), and a user click to start. Show a clear message if permission is denied or no camera exists. Never leave a blank panel.
- **Notch hover logic** relying on native cursor polling (desktop-only). In the browser it must use normal `mouseenter`/`mouseleave` on the top zone, with hysteresis to stop flicker.
- **Missing `.task` or `.wasm` files in the build output.** Confirm they exist in `dist/` after `npm run build`.

### 3.2 Fix, then deploy to Cloudflare Pages
1. Apply the fixes above.
2. Add `public/_headers`:
```
/*
  Permissions-Policy: camera=(self)
/*.wasm
  Content-Type: application/wasm
```
3. `npm run build`, then `npx wrangler pages deploy dist --project-name ergonotch`.
4. Keep GitHub Pages as a backup only if it also works. Make **one** URL the official one in the README and landing page.

### 3.3 Verify with Playwright on the DEPLOYED URL
- Page loads, notch pill visible, hover expands it, all 6 tabs open.
- Focus timer starts, pauses, resumes. Tasks can be added and completed. Habit can be toggled and persists after reload.
- With the fake webcam: camera enable works, indicator turns on, posture status appears, Pause turns the indicator off and stops tracks.
- Zero console errors. Zero third-party requests. Screenshot saved for the README.

---

## PART 4: FIX THE INSTALLER ("nothing happened")

### 4.1 Most likely cause to rule out FIRST
The summary says a dev instance `coucou.exe` is **already running locally**. The app has a **single-instance guard**. If the installed app is launched while another instance is running, the new one exits silently and nothing appears. Before every installer test:
```powershell
Get-Process coucou, notch -ErrorAction SilentlyContinue
Stop-Process -Name coucou, notch -Force -ErrorAction SilentlyContinue
```
Then reinstall and launch again.

### 4.2 Triage (work down the list; stop at the first thing that explains it)
1. **Did it install?** Find the installed exe: `Get-ChildItem $env:LOCALAPPDATA\Programs, "C:\Program Files" -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue | Where-Object Name -match "notch|coucou"`. Check Start Menu and "Installed apps".
2. **Is it running?** Task Manager / `Get-Process`. Check the system tray overflow (^) for the icon.
3. **Run it from PowerShell** to see errors: `& "<path to installed exe>"`. Read any output or crash message. Check Windows Event Viewer, Application log, for a crash entry.
4. **WebView2 Runtime missing or broken.** Tauri apps need the Microsoft Edge WebView2 Runtime. Check "Installed apps" for it. Win11 has it; some Win10 machines don't. In `tauri.conf.json` set `bundle.windows.webviewInstallMode` to `embedBootstrapper` (small, needs internet during install) or `offlineInstaller` (bigger, fully offline). Pick `offlineInstaller` if the offline claim matters.
5. **Window created but invisible.** Check in `tauri.conf.json` and the Rust setup: `visible`, window position/size, `transparent`, `decorations`, `alwaysOnTop`. The notch window may be off-screen or sized 0. Log the computed window position and monitor bounds at startup.
6. **Frontend not loading in the release build** (blank/transparent window). Dev uses `devUrl`, release uses bundled `frontendDist`. Check that `frontendDist` points at the real build folder and that Vite `base` is `./`.
7. **CSP blocks MediaPipe WASM in release.** Tauri's `security.csp` must allow WebAssembly: add `'wasm-unsafe-eval'` to `script-src`, and allow `blob:` and `data:` where MediaPipe needs them. Camera and workers can also be blocked by CSP. Open devtools on the release build to confirm.
8. **Autostart or tray code panicking at startup.** Look for `unwrap()` / `expect()` in the Rust `setup` hook and replace them with logged errors so one failure doesn't kill the app.

### 4.3 Make failures visible (do this regardless)
- Enable file logging (e.g. `tauri-plugin-log`) writing to `%LOCALAPPDATA%\Notch\logs\app.log`. Log startup steps: single-instance check, window creation (with position/size), tray creation, frontend load, any error.
- Enable the Tauri `devtools` feature in release builds temporarily so F12 / right-click Inspect works for debugging. Remove or hide before the final release if desired.
- Build a debug package first: `npx tauri build --debug`, test it, then do the release build.

### 4.4 Rename everything user-visible from "coucou" to "Notch"
`productName`, `identifier` (e.g. `com.yourname.notch`), window title, tray tooltip, the installed exe name, Start Menu entry, installer filename (`Notch-Setup.exe`), and the NSIS metadata. Judges will see `coucou.exe` otherwise. Keep the credit to Coucou in README and About.

### 4.5 Re-release and verify like a judge
- Bump the version to `1.0.1`, push the tag, and let the GitHub Actions workflow build the release (or upload manually if CI fails).
- **Download the .exe from the Releases page** (not from the repo folder), on a machine/VM without the dev instance, with SmartScreen "More info, Run anyway".
- Verify: notch appears, hover works, tray icon exists, reboot or sign-out/in launches it (if autostart is on), uninstall removes it, and only one instance can run.

---

## PART 5: MAKE ANIMATIONS SMOOTH

### 5.1 Measure first
Use the browser Performance panel (and devtools in the Tauri build) while expanding and collapsing. Report dropped frames and long tasks (over 50 ms). The goal is a steady 60 fps for expand/collapse.

### 5.2 Biggest causes of jank in a transparent Tauri window, and fixes
- **Resizing the native window on every animation frame.** This is slow on Windows. Prefer: make the window a fixed size large enough for the expanded panel, keep it transparent, and **animate only inside the page with CSS** (`transform` and `opacity`). Make the empty transparent area click-through (e.g. ignore cursor events when collapsed) so it doesn't block the desktop. If Coucou already resizes the window natively, check how it does it and keep whatever works smoothly.
- **Animating layout properties** (`width`, `height`, `top`, `left`). Animate `transform: scale/translate`, `opacity`, `clip-path`, or the `grid-template-rows: 0fr to 1fr` trick instead.
- **Heavy `backdrop-filter: blur`** on a transparent window. Test with it off. If it stutters, use a solid dark translucent background.
- **MediaPipe inference blocking the main thread.** Throttle to about 5 fps, use the `GPU` delegate if it works, run detection only while the camera is enabled, and pause it while the panel is collapsed unless the user wants background monitoring. If it still janks, move inference to a Web Worker.
- **Too many React re-renders** during animation. Memoize panels, avoid re-rendering the timer tree every second, and keep the timer tick in its own component.
- **Hover flicker.** Add a small hysteresis: expand on enter, collapse after the configured delay, and keep a slightly larger "safe zone" around the open panel.

### 5.3 Polish checklist
- Use one spring or ease-out curve consistently (about 250-350 ms expand, slightly faster collapse).
- Stagger tab content fade-in lightly. Add `will-change: transform, opacity` only on elements that animate.
- Respect the "animations off" setting and `prefers-reduced-motion`.
- Check at 100% and 150% display scaling, and on a second monitor if available.
- Mochi animations must not run when the panel is collapsed unless they are the idle animation.

---

## PART 6: Phase-gate checklist (run after every Part above)

- [ ] Build passes with no errors
- [ ] Console has zero errors
- [ ] Network shows no external requests and no 404s
- [ ] Feature clicked through and observed working
- [ ] Camera indicator turns off and the camera LED goes off when paused
- [ ] Works with Wi-Fi off
- [ ] Screenshot or log line captured as proof

---

## PART 7: Parallel agents in Antigravity (optional)

Antigravity 2.0 has a standalone **Agent Manager** app (separate from the editor) that can run several agents in parallel. If you have it:
1. Open the **same project folder (same absolute path)** in both the Antigravity editor and the Agent Manager, so changes show up in both.
2. Start one agent per row below and paste the **scope** into its prompt, e.g. *"Only edit files in [scope]. Do not edit anything else."*
3. Commit a git checkpoint before starting, review diffs in the editor, and merge in one place.

Split by **file ownership** so agents never write to the same file:

| Agent | Scope (only edit these) | Task |
|---|---|---|
| Web-Demo agent | `vite.config`, `platform.ts`, `public/`, deploy config | Part 3 |
| Installer agent | `src-tauri/`, `tauri.conf.json`, `.github/workflows/` | Part 4 |
| Animation agent | Notch window CSS/animation components | Part 5 (start after Parts 3 and 4 land, because it touches UI shared with the others) |
| QA agent | `tests/` only, no source edits | Runs checks from Part 6, reports bugs |
| Docs agent | `README.md`, landing page, `DEMO_SCRIPT.md` | Part 8 |

Rules: never let two agents edit the same file at once (it causes write and merge conflicts), the QA agent only reports, and you merge. If you are low on usage limits or the Agent Manager is not installed, skip this and run the Parts one by one in the priority order above. Parallel agents use up your limits faster.

---

## PART 8: Docs and cleanup

- Fix `SUMMARY.md` and `README.md`: remove every `file:///c:/Users/...` link and the local PID line. Use relative links (e.g. `./DEMO_SCRIPT.md`) or GitHub URLs.
- Make the official live-demo URL consistent everywhere (README, landing page, summary).
- Only claim what has been verified. Keep "0 outbound sockets" only if re-checked on the new release build, and state how it was checked.
- Add a short **Troubleshooting** section to the README: SmartScreen steps, WebView2 requirement, and "close any other instance if nothing appears".
- Add an About line in Settings crediting Coucou (MIT).

---

## PART 9: Final acceptance

- [ ] Live URL works in a fresh browser profile with fake/real webcam, with no console errors
- [ ] `Notch-Setup.exe` from GitHub Releases installs and shows the notch on a clean Windows machine
- [ ] No `coucou` naming left in anything user-visible
- [ ] Expand/collapse is smooth at 100% and 150% scaling
- [ ] Wi-Fi-off demo passes
- [ ] README and summary have no broken links; backup demo video is recorded and linked
