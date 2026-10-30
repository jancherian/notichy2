import { State } from "./state";
import { Sound } from "./sound";
import { Platform } from "./platform";

export type BreakType = "eye-rest" | "stretch" | "posture-reset" | "water";

export interface BreakDefinition {
  type: BreakType;
  title: string;
  icon: string;
  tag: string;
  summary: string;
  instructions: string[];
  defaultDurationSeconds: number;
}

export interface BreakEventLog {
  id: string;
  type: BreakType;
  title: string;
  timestamp: number;
  durationSeconds: number;
  action: "completed" | "snoozed" | "dismissed";
}

export interface ActiveBreakState {
  def: BreakDefinition;
  secondsLeft: number;
  totalSeconds: number;
  running: boolean;
  startedAt: number;
}

export const BREAK_DEFINITIONS: Record<BreakType, BreakDefinition> = {
  "eye-rest": {
    type: "eye-rest",
    title: "20-20-20 Eye Rest",
    icon: "👁️",
    tag: "Visual Health",
    summary: "Look at an object 20 feet away for 20 seconds to prevent ocular fatigue.",
    instructions: [
      "Shift your gaze away from all monitors.",
      "Fixate on an object at least 20 feet (6m) away across the room or out a window.",
      "Blink gently and allow your ciliary eye muscles to completely release tension.",
    ],
    defaultDurationSeconds: 20,
  },
  stretch: {
    type: "stretch",
    title: "Micro-Stretch & Tension Release",
    icon: "🧘",
    tag: "Mobility",
    summary: "Release upper thoracic, neck, and shoulder stiffness.",
    instructions: [
      "Stand up or sit upright with both feet flat on the floor.",
      "Clasp hands behind your back, gently retract shoulder blades, and breathe.",
      "Gently tilt head left, then right, releasing upper trapezius tension.",
      "Extend arms overhead and take a slow, restorative diaphragmatic breath.",
    ],
    defaultDurationSeconds: 60,
  },
  "posture-reset": {
    type: "posture-reset",
    title: "Spine & Posture Reset",
    icon: "🧍",
    tag: "Ergonomics",
    summary: "Re-center your pelvis and align cervical spine over your shoulders.",
    instructions: [
      "Scoot your hips all the way into the lumbar support of your chair.",
      "Plant feet flat on the floor with knees at a 90° angle.",
      "Gently tuck your chin and align ears directly over collarbones.",
      "Roll shoulders down and relax jaw tension.",
    ],
    defaultDurationSeconds: 30,
  },
  water: {
    type: "water",
    title: "Hydration Check",
    icon: "💧",
    tag: "Hydration",
    summary: "Drink 250–500ml water to sustain cognitive performance.",
    instructions: [
      "Step away from your workstation.",
      "Drink a full glass of clean, cool water.",
      "Enjoy a quiet 30-second mental reset before resuming focused work.",
    ],
    defaultDurationSeconds: 30,
  },
};

const STORAGE_KEYS = {
  INTERVAL: "notch_break_prompt_interval_v1",
  LOGS: "notch_wellbeing_break_logs_v1",
  PAUSED_UNTIL: "notch_break_prompts_paused_until_v1",
};

class WellbeingBreakManagerImpl {
  intervalMinutes: number = 45;
  pausedUntil: number | null = null;
  snoozeUntil: number | null = null;
  lastPromptFiredAt: number = Date.now();
  activeBreak: ActiveBreakState | null = null;
  deferredBreak: BreakDefinition | null = null;
  logs: BreakEventLog[] = [];

  private countdownIntervalId: number | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    this.loadPersisted();
    this.startCheckLoop();
  }

  private loadPersisted() {
    try {
      const savedInt = localStorage.getItem(STORAGE_KEYS.INTERVAL);
      if (savedInt) {
        this.intervalMinutes = parseInt(savedInt, 10) || 45;
      }
      const savedPaused = localStorage.getItem(STORAGE_KEYS.PAUSED_UNTIL);
      if (savedPaused) {
        const val = parseInt(savedPaused, 10);
        if (val > Date.now()) this.pausedUntil = val;
      }
      const savedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (savedLogs) {
        this.logs = JSON.parse(savedLogs);
      }
    } catch (e) {
      console.warn("[WellbeingBreakManager] Error loading persisted data:", e);
    }
  }

  private saveLogs() {
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs.slice(-100)));
    } catch {
      /* ignore */
    }
  }

  addListener(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
    State.notify();
  }

  setInterval(minutes: number) {
    this.intervalMinutes = Math.max(5, minutes);
    try {
      localStorage.setItem(STORAGE_KEYS.INTERVAL, String(this.intervalMinutes));
    } catch {
      /* ignore */
    }
    this.notify();
  }

  pauseAll(hours: number) {
    this.pausedUntil = Date.now() + hours * 3600 * 1000;
    try {
      localStorage.setItem(STORAGE_KEYS.PAUSED_UNTIL, String(this.pausedUntil));
    } catch {
      /* ignore */
    }
    if (this.activeBreak) {
      this.dismissCurrent();
    }
    this.notify();
  }

  resumeAll() {
    this.pausedUntil = null;
    try {
      localStorage.removeItem(STORAGE_KEYS.PAUSED_UNTIL);
    } catch {
      /* ignore */
    }
    this.lastPromptFiredAt = Date.now();
    this.notify();
  }

  isPaused(): boolean {
    return this.pausedUntil !== null && this.pausedUntil > Date.now();
  }

  private startCheckLoop() {
    window.setInterval(() => {
      this.checkScheduledPrompts();
    }, 10_000);
  }

  private checkScheduledPrompts() {
    // 1. If currently showing a prompt, don't re-notify!
    if (this.activeBreak) return;

    // 2. If paused, skip
    if (this.isPaused()) return;

    // 3. If snoozed, check if snooze expired
    const now = Date.now();
    if (this.snoozeUntil) {
      if (now >= this.snoozeUntil) {
        this.snoozeUntil = null;
        this.triggerPrompt();
      }
      return;
    }

    // 4. Check regular interval
    const intervalMs = this.intervalMinutes * 60 * 1000;
    if (now - this.lastPromptFiredAt >= intervalMs) {
      this.triggerPrompt();
    }
  }

  /**
   * Called by FocusEngine when an active work session completes or break starts.
   * Delivers any deferred prompts held during focus.
   */
  onFocusSessionComplete() {
    if (this.deferredBreak) {
      const def = this.deferredBreak;
      this.deferredBreak = null;
      this.launchBreak(def);
    }
  }

  triggerPrompt(specificType?: BreakType) {
    // Select break definition (cycle or specific)
    let def: BreakDefinition;
    if (specificType && BREAK_DEFINITIONS[specificType]) {
      def = BREAK_DEFINITIONS[specificType];
    } else {
      const types: BreakType[] = ["eye-rest", "stretch", "posture-reset", "water"];
      const nextIndex = Math.floor(Math.random() * types.length);
      def = BREAK_DEFINITIONS[types[nextIndex]];
    }

    // Spec rule: "During an active focus session, hold non-critical prompts until the session ends or a break begins."
    if (State.timerRunning && State.timerMode === "work") {
      this.deferredBreak = def;
      return;
    }

    this.launchBreak(def);
  }

  private launchBreak(def: BreakDefinition) {
    this.lastPromptFiredAt = Date.now();
    this.snoozeUntil = null;

    this.activeBreak = {
      def,
      secondsLeft: def.defaultDurationSeconds,
      totalSeconds: def.defaultDurationSeconds,
      running: true,
      startedAt: Date.now(),
    };

    // Audio chime & notification
    Sound.play("work");
    void Platform.notify(`Notch Wellbeing Break ${def.icon}`, {
      body: `${def.title}: ${def.summary}`,
      icon: "/mochi.png",
    });

    this.startCountdown();
    this.notify();
  }

  private startCountdown() {
    if (this.countdownIntervalId != null) {
      clearInterval(this.countdownIntervalId);
    }

    this.countdownIntervalId = window.setInterval(() => {
      if (!this.activeBreak || !this.activeBreak.running) return;

      this.activeBreak.secondsLeft--;
      if (this.activeBreak.secondsLeft <= 0) {
        this.activeBreak.secondsLeft = 0;
        this.completeCurrent();
      } else {
        this.notify();
      }
    }, 1000);
  }

  completeCurrent() {
    if (!this.activeBreak) return;

    if (this.countdownIntervalId != null) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }

    const log: BreakEventLog = {
      id: `break-${Date.now()}`,
      type: this.activeBreak.def.type,
      title: this.activeBreak.def.title,
      timestamp: Date.now(),
      durationSeconds: this.activeBreak.totalSeconds,
      action: "completed",
    };

    this.logs.unshift(log);
    this.saveLogs();

    Sound.play("finish");
    this.activeBreak = null;
    this.lastPromptFiredAt = Date.now();
    this.notify();
  }

  snoozeCurrent(minutes = 5) {
    if (!this.activeBreak) return;

    if (this.countdownIntervalId != null) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }

    const log: BreakEventLog = {
      id: `break-${Date.now()}`,
      type: this.activeBreak.def.type,
      title: this.activeBreak.def.title,
      timestamp: Date.now(),
      durationSeconds: this.activeBreak.totalSeconds - this.activeBreak.secondsLeft,
      action: "snoozed",
    };

    this.logs.unshift(log);
    this.saveLogs();

    this.snoozeUntil = Date.now() + minutes * 60 * 1000;
    this.activeBreak = null;
    this.notify();
  }

  dismissCurrent() {
    if (!this.activeBreak) return;

    if (this.countdownIntervalId != null) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }

    const log: BreakEventLog = {
      id: `break-${Date.now()}`,
      type: this.activeBreak.def.type,
      title: this.activeBreak.def.title,
      timestamp: Date.now(),
      durationSeconds: this.activeBreak.totalSeconds - this.activeBreak.secondsLeft,
      action: "dismissed",
    };

    this.logs.unshift(log);
    this.saveLogs();

    this.activeBreak = null;
    this.lastPromptFiredAt = Date.now();
    this.notify();
  }

  toggleActiveCountdown() {
    if (!this.activeBreak) return;
    this.activeBreak.running = !this.activeBreak.running;
    this.notify();
  }
}

export const WellbeingBreakManager = new WellbeingBreakManagerImpl();
