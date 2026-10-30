import { State } from "./state";
import { Bridge } from "./bridge";
import { PostureEngine } from "./posture";
import { FatigueEngine } from "./fatigue";
import { TaskManager } from "./tasks";
import { HabitManager } from "./habits";
import { FocusEngine } from "./focus";
import { Sound } from "./sound";

export interface NotchSettingsData {
  launchAtSignIn: boolean;
  cameraAnalysis: boolean;
  facialAnalysis: boolean;
  usageTracking: boolean;
  animations: boolean;
  notificationFrequency: "low" | "normal" | "frequent";
  hoverSensitivity: "low" | "normal" | "high";
  collapseDelay: number; // 2, 5, 10, 15
  demoMode: boolean;
}

const STORAGE_KEY = "notch_settings_v1";

const DEFAULT_SETTINGS: NotchSettingsData = {
  launchAtSignIn: false,
  cameraAnalysis: false,
  facialAnalysis: false,
  usageTracking: true,
  animations: true,
  notificationFrequency: "normal",
  hoverSensitivity: "normal",
  collapseDelay: 5,
  demoMode: false,
};

class NotchSettingsManager {
  data: NotchSettingsData = { ...DEFAULT_SETTINGS };
  private listeners = new Set<() => void>();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.data = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      this.data = { ...DEFAULT_SETTINGS };
    }
    this.applyEffects();
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
    this.applyEffects();
    this.notify();
  }

  addListener(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
    State.notify();
  }

  private applyEffects() {
    if (typeof document !== "undefined") {
      document.body.classList.toggle("no-animations", !this.data.animations);
    }
    PostureEngine.setDemoMode(this.data.demoMode);
  }

  setLaunchAtSignIn(enabled: boolean) {
    this.data.launchAtSignIn = enabled;
    State.settings.autostart = enabled;
    Bridge.saveSettings(State.settings).catch(() => {});
    this.save();
  }

  setCameraAnalysis(enabled: boolean) {
    this.data.cameraAnalysis = enabled;
    if (enabled) {
      PostureEngine.start();
    } else {
      PostureEngine.stop();
    }
    this.save();
  }

  setFacialAnalysis(enabled: boolean) {
    this.data.facialAnalysis = enabled;
    FatigueEngine.setEnabled(enabled);
    this.save();
  }

  setUsageTracking(enabled: boolean) {
    this.data.usageTracking = enabled;
    this.save();
  }

  setAnimations(enabled: boolean) {
    this.data.animations = enabled;
    this.save();
  }

  setNotificationFrequency(freq: "low" | "normal" | "frequent") {
    this.data.notificationFrequency = freq;
    this.save();
  }

  setHoverSensitivity(sens: "low" | "normal" | "high") {
    this.data.hoverSensitivity = sens;
    this.save();
  }

  setCollapseDelay(seconds: number) {
    this.data.collapseDelay = seconds;
    State.settings.autoCloseInterval = seconds;
    Bridge.saveSettings(State.settings).catch(() => {});
    this.save();
  }

  setDemoMode(enabled: boolean) {
    this.data.demoMode = enabled;
    this.save();
  }

  deleteAllData() {
    try {
      localStorage.removeItem("notch_tasks_v1");
      localStorage.removeItem("notch_habits_v1");
      localStorage.removeItem("notch_focus_state_v1");
      localStorage.removeItem("notch_focus_logs_v1");
      localStorage.removeItem("notch_wellbeing_break_logs_v1");
      localStorage.removeItem("notch_posture_baseline_v1");
      localStorage.removeItem("notch_posture_config_v1");
      localStorage.removeItem("notch_fatigue_config_v1");
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }

    // Reset runtime states
    PostureEngine.resetCalibration();
    PostureEngine.stop();
    FatigueEngine.setEnabled(false);
    TaskManager.tasks = [];
    TaskManager.save();
    HabitManager.resetDemoData();
    FocusEngine.logs = [];
    this.data = { ...DEFAULT_SETTINGS };
    this.save();
    Sound.play("finish");
  }
}

export const NotchSettings = new NotchSettingsManager();
