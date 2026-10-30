// Entry point: boot the bridge, wire the island, start the greeting.

import "./style.css";
import { Bridge, IS_TAURI, onEvent } from "./core/bridge";
import { Sound } from "./core/sound";
import { State, type Settings } from "./core/state";
import { Island } from "./island/island";
import { registerShortcutHandlers } from "./island/shortcuts";
import { onLanguageChange, resolveLanguage, setLanguage, systemLanguages } from "./i18n/i18n";

// Global error handlers logging to app.log
window.onerror = (message, source, lineno, colno, error) => {
  const errStr = `[Window Error] ${message} at ${source}:${lineno}:${colno} - ${error?.stack || error}`;
  console.error(errStr);
  void Bridge.log(errStr);
  return false;
};

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason);
  const errStr = `[Unhandled Rejection] ${reason}`;
  console.error(errStr);
  void Bridge.log(errStr);
});

/** Helper to wrap any optional boot promise with a hard timeout and fallback */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T, name: string): Promise<T> {
  let timer: number | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = window.setTimeout(() => {
      console.warn(`[Boot] ${name} timed out after ${ms}ms - using fallback`);
      void Bridge.log(`[Boot] ${name} timed out after ${ms}ms - using fallback`);
      resolve(fallback);
    }, ms);
  });
  try {
    const res = await Promise.race([promise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return res;
  } catch (err) {
    if (timer) clearTimeout(timer);
    console.error(`[Boot] ${name} failed:`, err);
    void Bridge.log(`[Boot] ${name} failed: ${err}`);
    return fallback;
  }
}

/** Shows the language Settings asks for ("" = the system's, when Coucou has it). */
function applyLanguage() {
  setLanguage(resolveLanguage(State.settings.language, systemLanguages()));
}

async function main() {
  const bootStartTime = performance.now();
  const root = document.getElementById("root");
  if (!root) return;

  const markBootReady = () => {
    if (document.body.dataset.ready === "1") return;
    document.body.dataset.ready = "1";
    const elapsed = Math.round(performance.now() - bootStartTime);
    console.log(`BOOT_READY ${elapsed}ms`);
    void Bridge.log(`BOOT_READY ${elapsed}ms`);
  };

  void Sound.preload();

  // Before the island exists: its canvases size their bitmaps from the pixel
  // ratio once, so the zoom correction has to land first. If zoom was adjusted,
  // wait until the ratio updates (or up to 500ms) so nothing is sized against
  // the stale value.
  const dprBefore = window.devicePixelRatio || 1;
  const zoomChanged = await withTimeout(Bridge.fitZoom(dprBefore), 2000, false, "fitZoom");
  if (zoomChanged) {
    for (let i = 0; i < 20 && window.devicePixelRatio === dprBefore; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  const island = new Island(root);
  (window as any).__island = island;
  (window as any).__state = State;
  (window as any).island = island;
  (window as any).state = State;

  const boot = await withTimeout(Bridge.boot(), 2000, null, "bridgeBoot");
  if (boot) {
    State.settings = { ...State.settings, ...boot.settings };
  }
  // A language change redraws the island in place: the texts given as tl(…)
  // relabel themselves (views/dom.ts) and the views redraw the rest on this
  // sync. Nothing is rebuilt, so tasks, steps and the chat stay as they are.
  onLanguageChange(() => State.notify());
  applyLanguage();
  // Rust shows the tray and its errors in the same language as the webview.
  void Bridge.setSystemLanguages(systemLanguages());
  island.applySettings();
  State.tasks = [];
  if (boot && !boot.cursorPoll) island.followPageCursor();
  await withTimeout(island.desktop.init(), 2000, undefined, "desktopInit");

  await onEvent<{ x: number; y: number }>("cursor", ({ x, y }) => island.onCursor(x, y));
  await onEvent<boolean>("pointer-inside", (inside) => island.setPointerInside(inside));

  /** Pause has to reach Rust too, or the pollers keep calling out. */
  const setPaused = (on: boolean) => {
    if (State.paused === on) return;
    State.paused = on;
    void Bridge.setPaused(on);
  };

  await onEvent<string>("tray", (what) => {
    switch (what) {
      case "settings":
        setPaused(false);
        island.alert("settings");
        break;
      case "open":
        setPaused(false);
        island.alert(State.defaultView());
        break;
      case "wardrobe":
        setPaused(false);
        island.alert("wardrobe");
        break;
      case "pause":
        setPaused(!State.paused);
        if (State.paused) island.fsm.forceHidden();
        else island.reveal();
        break;
    }
  });

  const checkZoom = async () => {
    const dpr = window.devicePixelRatio || 1;
    await Bridge.fitZoom(dpr);
  };

  await onEvent<null>("screen-changed", async () => {
    await checkZoom();
    void Bridge.reposition();
    island.ensureRunning();
  });

  // A query only matches the ratio it was made for: once it changes, watch the
  // new one, or the next monitor's scale goes unnoticed and the zoom stays wrong.
  // One frame redraws Mochi at the new ratio, even while the loop is idle.
  const watchRatio = () => {
    window
      .matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      .addEventListener?.("change", () => {
        watchRatio();
        void checkZoom();
        island.ensureRunning();
      }, { once: true });
  };
  watchRatio();

  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
      e.preventDefault();
    }
  });

  // Settings → Reload sounds: read the sounds folder again, and let them hear it.
  await onEvent<null>("sounds-changed", () => {
    void Sound.reload().then(() => Sound.play("pop"));
  });

  // The settings window writes preferences; apply them here without a restart.
  await onEvent<Settings>("settings-changed", (s) => {
    const previousMain = State.mainPillId;
    State.settings = { ...State.settings, ...s };
    applyLanguage();
    island.applySettings();
    State.tasks = [];
    // A new main tool comes to the front, as on macOS.
    if (State.mainPillId !== previousMain) State.setFocus(State.mainPillId);
  });

  registerShortcutHandlers(island, () => setPaused(false));
  // registerVoiceHandlers();
  // Offline: disabled Claude Code hooks, Phone Link, Integrations, WhatsApp, Updates, Spotify
  State.view = "focus";
  island.fsm.reveal();
  markBootReady();

  // 5-second watchdog: guarantee boot is never stuck on a loader or greeting
  window.setTimeout(() => {
    if (document.body.dataset.ready !== "1") {
      console.warn("Boot watchdog triggered at 5s - forcing ready state");
      void Bridge.log("Boot watchdog triggered at 5s - forcing ready state");
      if (island.fsm.state === "coucou") {
        island.fsm.forceHome();
      }
      markBootReady();
    }
  }, 5000);

  // Stage 12A: Browser Live Web Preview mode
  if (!IS_TAURI) {
    document.body.classList.add("browser-preview");
    document.addEventListener("click", () => Sound.resume(), { once: true });

    // Web preview banner
    const banner = document.createElement("div");
    banner.className = "web-preview-banner";
    banner.innerHTML = `
      <span class="banner-badge">Web Preview</span>
      <span class="banner-text">Web preview. Install the desktop app for system-wide notch, tray, and launch at sign-in.</span>
      <a href="https://github.com/jancherian/ergonotch/releases/download/v1.0.0/Notch-Setup.exe" class="banner-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download for Windows
      </a>
      <a href="./about.html" class="banner-secondary-btn">About &amp; Architecture</a>
      <button type="button" class="banner-secondary-btn" id="toggle-notch-btn">Toggle Notch</button>
    `;
    document.body.appendChild(banner);

    const toggleBtn = banner.querySelector("#toggle-notch-btn");
    toggleBtn?.addEventListener("click", () => {
      if (State.mode === "expanded") {
        island.collapse();
      } else {
        island.expand(State.defaultView());
        island.setPinned(true);
      }
    });

    // Ensure direct DOM hover on island & wake-strip in browser mode
    const islandEl = document.getElementById("island");
    const wakeStripEl = document.getElementById("wake-strip");
    wakeStripEl?.addEventListener("mouseenter", () => {
      island.fsm.mouseEntered();
    });
    islandEl?.addEventListener("mouseenter", () => {
      island.fsm.mouseEntered();
    });
    islandEl?.addEventListener("click", () => {
      if (State.mode !== "expanded") {
        island.expand(State.defaultView());
        island.setPinned(true);
      }
    });
    islandEl?.addEventListener("mouseleave", (e) => {
      const rect = islandEl.getBoundingClientRect();
      if (e.clientY < rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right) return;
      island.fsm.mouseLeft();
    });

    // Helper hint at the top
    const hint = document.createElement("div");
    hint.className = "web-preview-desktop-hint";
    hint.innerHTML = `<span>↓ Hover or click the notch pill at the top of the screen to expand</span>`;
    document.body.appendChild(hint);

    State.subscribe(() => {
      hint.style.opacity = State.mode === "expanded" ? "0" : "0.5";
    });
  }
}

void main();
