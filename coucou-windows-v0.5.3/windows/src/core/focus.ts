// Focus Timer Engine — manages work/break intervals, timestamp-based tracking
// (prevents drift and corruptions across pauses/restarts), interruption logging,
// and session history.

import { State } from "./state";
import { Sound } from "./sound";
import { WellbeingBreakManager } from "./wellbeing-breaks";

export interface FocusSessionLog {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  mode: "work" | "break";
  durationSeconds: number;
  startedAt: number;
  finishedAt: number;
  interruptions: number;
}

export interface FocusPersistedState {
  mode: "work" | "break";
  workDurationMinutes: number;
  breakDurationMinutes: number;
  secondsLeft: number;
  totalSeconds: number;
  running: boolean;
  interruptions: number;
  accumulatedActiveSeconds: number;
  lastTickAt: number | null;
  activeTaskId: string | null;
  activeTaskTitle: string | null;
  showBreakPrompt: boolean;
}

import { Platform } from "./platform";

const STATE_STORAGE_KEY = "notch_focus_state_v1";
const LOGS_STORAGE_KEY = "notch_focus_logs_v1";

export function sendNotification(title: string, body: string) {
  void Platform.notify(title, { body });
}

class FocusEngineClass {
  mode: "work" | "break" = "work";
  workDurationMinutes: number = 25;
  breakDurationMinutes: number = 5;
  secondsLeft: number = 25 * 60;
  totalSeconds: number = 25 * 60;
  running: boolean = false;
  interruptions: number = 0;
  accumulatedActiveSeconds: number = 0;
  lastTickAt: number | null = null;
  showBreakPrompt: boolean = false;

  logs: FocusSessionLog[] = [];

  private timerId: number | null = null;

  constructor() {
    this.loadLogs();
    this.loadState();
    this.startLoop();
  }

  private loadLogs() {
    try {
      const raw = localStorage.getItem(LOGS_STORAGE_KEY);
      if (raw) {
        this.logs = JSON.parse(raw);
        State.focusLogs = this.logs;
      }
    } catch (e) {
      console.warn("Failed to load focus logs:", e);
    }
  }

  private saveLogs() {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(this.logs));
      State.focusLogs = [...this.logs];
    } catch (e) {
      console.warn("Failed to save focus logs:", e);
    }
  }

  private loadState() {
    try {
      const raw = localStorage.getItem(STATE_STORAGE_KEY);
      if (!raw) {
        this.syncToState();
        return;
      }
      const data: FocusPersistedState = JSON.parse(raw);
      this.mode = data.mode ?? "work";
      this.workDurationMinutes = data.workDurationMinutes ?? 25;
      this.breakDurationMinutes = data.breakDurationMinutes ?? 5;
      this.totalSeconds = data.totalSeconds ?? this.workDurationMinutes * 60;
      this.interruptions = data.interruptions ?? 0;
      this.accumulatedActiveSeconds = data.accumulatedActiveSeconds ?? 0;
      this.showBreakPrompt = data.showBreakPrompt ?? false;

      if (data.activeTaskId) State.activeTaskId = data.activeTaskId;
      if (data.activeTaskTitle) State.activeTaskTitle = data.activeTaskTitle;

      if (data.running && data.lastTickAt) {
        // App was closed while timer was running. Compute exact elapsed seconds from timestamps.
        const now = Date.now();
        const elapsedSec = Math.floor((now - data.lastTickAt) / 1000);
        if (elapsedSec >= data.secondsLeft) {
          // Completed while closed
          this.secondsLeft = 0;
          this.accumulatedActiveSeconds += data.secondsLeft;
          this.running = false;
          this.lastTickAt = null;
          this.onSessionComplete(false);
        } else {
          this.secondsLeft = data.secondsLeft - elapsedSec;
          this.accumulatedActiveSeconds += elapsedSec;
          this.running = true;
          this.lastTickAt = now;
        }
      } else {
        // Was paused or stopped
        this.secondsLeft = data.secondsLeft ?? this.totalSeconds;
        this.running = false;
        this.lastTickAt = null;
      }

      this.syncToState();
    } catch (e) {
      console.warn("Failed to load focus state:", e);
      this.syncToState();
    }
  }

  saveState() {
    try {
      const data: FocusPersistedState = {
        mode: this.mode,
        workDurationMinutes: this.workDurationMinutes,
        breakDurationMinutes: this.breakDurationMinutes,
        secondsLeft: this.secondsLeft,
        totalSeconds: this.totalSeconds,
        running: this.running,
        interruptions: this.interruptions,
        accumulatedActiveSeconds: this.accumulatedActiveSeconds,
        lastTickAt: this.lastTickAt,
        activeTaskId: State.activeTaskId,
        activeTaskTitle: State.activeTaskTitle,
        showBreakPrompt: this.showBreakPrompt,
      };
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save focus state:", e);
    }
  }

  private startLoop() {
    if (this.timerId != null) window.clearInterval(this.timerId);
    this.timerId = window.setInterval(() => this.tick(), 250);
  }

  private tick() {
    if (!this.running || !this.lastTickAt) return;

    const now = Date.now();
    const elapsedMs = now - this.lastTickAt;
    if (elapsedMs >= 1000) {
      const elapsedSec = Math.floor(elapsedMs / 1000);
      this.lastTickAt = now - (elapsedMs % 1000); // Preserve remainder ms

      if (this.secondsLeft > elapsedSec) {
        this.secondsLeft -= elapsedSec;
        if (this.mode === "work") {
          this.accumulatedActiveSeconds += elapsedSec;
        }
        this.syncToState();
        this.saveState();
      } else {
        // Session finished!
        const remaining = this.secondsLeft;
        this.secondsLeft = 0;
        if (this.mode === "work") {
          this.accumulatedActiveSeconds += remaining;
        }
        this.syncToState();
        this.onSessionComplete(true);
      }
    }
  }

  start() {
    if (this.running) return;

    const now = Date.now();
    this.running = true;
    this.lastTickAt = now;
    this.showBreakPrompt = false;

    // Fresh session start
    if (this.secondsLeft === this.totalSeconds) {
      this.interruptions = 0;
      this.accumulatedActiveSeconds = 0;
    }

    Sound.play(this.mode === "work" ? "work" : "blip");
    this.syncToState();
    this.saveState();
  }

  pause() {
    if (!this.running) return;

    // Apply any partial elapsed seconds before pausing
    if (this.lastTickAt) {
      const now = Date.now();
      const elapsedSec = Math.floor((now - this.lastTickAt) / 1000);
      if (elapsedSec > 0) {
        this.secondsLeft = Math.max(0, this.secondsLeft - elapsedSec);
        if (this.mode === "work") {
          this.accumulatedActiveSeconds += elapsedSec;
        }
      }
    }

    this.running = false;
    this.lastTickAt = null;
    if (this.mode === "work") {
      this.interruptions += 1;
    }

    Sound.play("peek");
    this.syncToState();
    this.saveState();
  }

  resume() {
    this.start();
  }

  reset() {
    this.running = false;
    this.lastTickAt = null;
    this.secondsLeft = this.totalSeconds;
    this.interruptions = 0;
    this.accumulatedActiveSeconds = 0;
    this.showBreakPrompt = false;

    Sound.play("close");
    this.syncToState();
    this.saveState();
  }

  setWorkDuration(minutes: number) {
    this.workDurationMinutes = Math.max(1, Math.min(180, minutes));
    if (this.mode === "work" && !this.running) {
      this.totalSeconds = this.workDurationMinutes * 60;
      this.secondsLeft = this.totalSeconds;
      this.interruptions = 0;
      this.accumulatedActiveSeconds = 0;
    }
    this.syncToState();
    this.saveState();
  }

  setBreakDuration(minutes: number) {
    this.breakDurationMinutes = Math.max(1, Math.min(60, minutes));
    if (this.mode === "break" && !this.running) {
      this.totalSeconds = this.breakDurationMinutes * 60;
      this.secondsLeft = this.totalSeconds;
    }
    this.syncToState();
    this.saveState();
  }

  startBreak() {
    this.running = false;
    this.mode = "break";
    this.totalSeconds = this.breakDurationMinutes * 60;
    this.secondsLeft = this.totalSeconds;
    this.showBreakPrompt = false;
    this.start();
  }

  skipBreak() {
    this.running = false;
    this.mode = "work";
    this.totalSeconds = this.workDurationMinutes * 60;
    this.secondsLeft = this.totalSeconds;
    this.interruptions = 0;
    this.accumulatedActiveSeconds = 0;
    this.showBreakPrompt = false;
    this.syncToState();
    this.saveState();
  }

  dismissBreakPrompt() {
    this.showBreakPrompt = false;
    this.syncToState();
    this.saveState();
  }

  attachTask(id: string, title: string) {
    State.activeTaskId = id;
    State.activeTaskTitle = title;
    this.saveState();
    State.notify();
  }

  detachTask() {
    State.activeTaskId = null;
    State.activeTaskTitle = null;
    this.saveState();
    State.notify();
  }

  private onSessionComplete(notifyUser: boolean) {
    this.running = false;
    this.lastTickAt = null;

    // Record session log
    const log: FocusSessionLog = {
      id: `session-${Date.now()}`,
      taskId: State.activeTaskId,
      taskTitle: State.activeTaskTitle,
      mode: this.mode,
      durationSeconds: this.totalSeconds,
      startedAt: Date.now() - this.totalSeconds * 1000,
      finishedAt: Date.now(),
      interruptions: this.interruptions,
    };
    this.logs.unshift(log);
    this.saveLogs();

    if (this.mode === "work") {
      this.showBreakPrompt = true;
      WellbeingBreakManager.onFocusSessionComplete();
      if (notifyUser) {
        Sound.play("finish");
        const pauseText = this.interruptions === 1 ? "1 pause" : `${this.interruptions} pauses`;
        sendNotification(
          "Focus Session Complete! 🎉",
          `Great work! You focused for ${this.workDurationMinutes}m with ${pauseText}. Ready for a ${this.breakDurationMinutes}m break?`,
        );
      }
    } else {
      // Break over
      this.mode = "work";
      this.totalSeconds = this.workDurationMinutes * 60;
      this.secondsLeft = this.totalSeconds;
      this.interruptions = 0;
      this.accumulatedActiveSeconds = 0;
      this.showBreakPrompt = false;
      if (notifyUser) {
        Sound.play("finish");
        sendNotification(
          "Break Finished ☕",
          `Break is complete! Ready to start your next ${this.workDurationMinutes}m focus session?`,
        );
      }
    }

    this.syncToState();
    this.saveState();
  }

  syncToState() {
    State.timerMode = this.mode;
    State.timerSecondsLeft = this.secondsLeft;
    State.timerTotalSeconds = this.totalSeconds;
    State.timerRunning = this.running;
    State.timerInterruptions = this.interruptions;
    State.showBreakPrompt = this.showBreakPrompt;
    State.workDurationMinutes = this.workDurationMinutes;
    State.breakDurationMinutes = this.breakDurationMinutes;
    State.notify();
  }
}

export const FocusEngine = new FocusEngineClass();

