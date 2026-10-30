import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { State } from "./state";
import { Sound } from "./sound";
import { FocusEngine } from "./focus";
import { Platform } from "./platform";

export interface FatigueMetrics {
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  eyesClosed: boolean;
  eyeClosedDurationMs: number;
  perclosRatio: number;
  continuousActiveMinutes: number;
  minutesSinceBreak: number;
  suggestion: string | null;
  status: "normal" | "break-suggested" | "unavailable";
  statusText: string;
}

export interface FatigueConfig {
  enabled: boolean;
  demoMode: boolean;
  blinkThreshold: number;
  prolongedClosureThresholdMs: number;
  perclosThreshold: number;
  cooldownMinutes: number;
}

const STORAGE_KEYS = {
  ENABLED: "notch_facial_analysis_enabled_v1",
  DEMO_MODE: "notch_fatigue_demo_mode_v1",
};

class FatigueEngineImpl {
  private landmarker: FaceLandmarker | null = null;
  private initializingLandmarker: Promise<FaceLandmarker | null> | null = null;

  config: FatigueConfig = {
    enabled: false,
    demoMode: false,
    blinkThreshold: 0.5,
    prolongedClosureThresholdMs: 1500,
    perclosThreshold: 0.18,
    cooldownMinutes: 3,
  };

  private samples: { t: number; closed: boolean }[] = [];
  private eyeClosureStartedAt: number | null = null;
  private currentClosureDurationMs = 0;
  private lastNotificationAt = 0;
  private currentMetrics: FatigueMetrics | null = null;
  private listeners = new Set<(m: FatigueMetrics | null) => void>();
  private appStartTime = Date.now();
  private isProcessing = false;

  constructor() {
    this.loadPersisted();
  }

  private loadPersisted() {
    try {
      const savedEnabled = localStorage.getItem(STORAGE_KEYS.ENABLED);
      if (savedEnabled !== null) {
        this.config.enabled = savedEnabled === "true";
        State.facialAnalysisActive = this.config.enabled;
      }
      const savedDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE);
      if (savedDemo !== null) {
        this.config.demoMode = savedDemo === "true";
        State.fatigueDemoMode = this.config.demoMode;
      }
    } catch (e) {
      console.warn("[FatigueEngine] Error loading stored config:", e);
    }
  }

  setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
    State.facialAnalysisActive = enabled;
    try {
      localStorage.setItem(STORAGE_KEYS.ENABLED, String(enabled));
    } catch {
      /* ignore */
    }
    if (!enabled) {
      this.reset();
    }
    State.notify();
  }

  setDemoMode(enabled: boolean) {
    this.config.demoMode = enabled;
    State.fatigueDemoMode = enabled;
    try {
      localStorage.setItem(STORAGE_KEYS.DEMO_MODE, String(enabled));
    } catch {
      /* ignore */
    }
    State.notify();
  }

  addListener(fn: (m: FatigueMetrics | null) => void) {
    this.listeners.add(fn);
    fn(this.currentMetrics);
    return () => this.listeners.delete(fn);
  }

  private emitMetrics(m: FatigueMetrics | null) {
    this.currentMetrics = m;
    for (const fn of this.listeners) {
      try {
        fn(m);
      } catch (err) {
        console.error("[FatigueEngine] listener error:", err);
      }
    }
  }

  getMetrics(): FatigueMetrics | null {
    return this.currentMetrics;
  }

  reset() {
    this.samples = [];
    this.eyeClosureStartedAt = null;
    this.currentClosureDurationMs = 0;
    this.currentMetrics = null;
    State.fatiguePerclos = 0;
    State.fatigueEyeClosedDuration = 0;
    State.fatigueSuggestion = null;
    this.emitMetrics(null);
  }

  async ensureLandmarker(): Promise<FaceLandmarker | null> {
    if (this.landmarker) return this.landmarker;
    if (this.initializingLandmarker) return this.initializingLandmarker;

    this.initializingLandmarker = (async () => {
      try {
        const wasmBase = new URL("wasm/", document.baseURI).href;
        const vision = await FilesetResolver.forVisionTasks(wasmBase);

        const modelPath = new URL("models/face_landmarker.task", document.baseURI).href;

        let lm: FaceLandmarker;
        try {
          lm = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (gpuErr) {
          console.warn("[FatigueEngine] GPU delegate unavailable for FaceLandmarker, trying CPU:", gpuErr);
          lm = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        }

        this.landmarker = lm;
        return lm;
      } catch (err) {
        console.error("[FatigueEngine] Failed to load local FaceLandmarker:", err);
        return null;
      } finally {
        this.initializingLandmarker = null;
      }
    })();

    return this.initializingLandmarker;
  }

  async processFrame(videoEl: HTMLVideoElement, timestamp: number) {
    if (!this.config.enabled || !State.cameraActive) return;
    if (this.isProcessing || videoEl.readyState < 2) return;

    this.isProcessing = true;
    try {
      const lm = await this.ensureLandmarker();
      if (!lm) return;

      const result = lm.detectForVideo(videoEl, timestamp);
      this.evaluateResult(result);
    } catch (err) {
      console.warn("[FatigueEngine] Inference error:", err);
    } finally {
      this.isProcessing = false;
    }
  }

  private evaluateResult(result: FaceLandmarkerResult) {
    const now = Date.now();

    // 1. Missing signals = no conclusion. Never guess.
    if (
      !result.faceBlendshapes ||
      result.faceBlendshapes.length === 0 ||
      !result.faceBlendshapes[0] ||
      !result.faceLandmarks ||
      result.faceLandmarks.length === 0
    ) {
      this.handleUnavailable();
      return;
    }

    const categories = result.faceBlendshapes[0].categories;
    let eyeBlinkLeft = 0;
    let eyeBlinkRight = 0;

    for (const c of categories) {
      if (c.categoryName === "eyeBlinkLeft") eyeBlinkLeft = c.score;
      else if (c.categoryName === "eyeBlinkRight") eyeBlinkRight = c.score;
    }

    const avgBlink = (eyeBlinkLeft + eyeBlinkRight) / 2;
    const isClosed = avgBlink >= this.config.blinkThreshold;

    // 2. Track eye-closure duration:
    if (isClosed) {
      if (!this.eyeClosureStartedAt) {
        this.eyeClosureStartedAt = now;
      }
      this.currentClosureDurationMs = now - this.eyeClosureStartedAt;
    } else {
      this.eyeClosureStartedAt = null;
      this.currentClosureDurationMs = 0;
    }

    // 3. Track rolling PERCLOS over 60s (or 15s in demo mode):
    const windowMs = this.config.demoMode ? 15000 : 60000;
    this.samples.push({ t: now, closed: isClosed });
    this.samples = this.samples.filter((s) => now - s.t <= windowMs);

    const closedCount = this.samples.filter((s) => s.closed).length;
    const perclosRatio = this.samples.length > 0 ? closedCount / this.samples.length : 0;

    // 4. Combine in rule engine with time since last break and continuous use:
    // Query FocusEngine logs for last break
    const lastBreak = FocusEngine.logs.find((l) => l.mode === "break");
    const minutesSinceBreak = lastBreak
      ? Math.max(0, Math.floor((now - lastBreak.finishedAt) / (60 * 1000)))
      : Math.floor((now - this.appStartTime) / (60 * 1000));

    const continuousActiveMinutes = Math.floor((now - this.appStartTime) / (60 * 1000));

    // Threshold evaluation:
    const prolongedClosureTriggered =
      this.currentClosureDurationMs >= this.config.prolongedClosureThresholdMs;
    const perclosTriggered = perclosRatio >= this.config.perclosThreshold;

    let status: "normal" | "break-suggested" | "unavailable" = "normal";
    let suggestion: string | null = null;
    let statusText = "Eye rest: Normal";

    // Phrasing constraints:
    // "Output only a soft suggestion: 'You might be getting tired. Consider a short break.'
    // Never say 'fatigued', 'drowsy' as a diagnosis, and never medical wording."
    if (prolongedClosureTriggered || perclosTriggered) {
      const timeConditionMet = this.config.demoMode
        ? true
        : minutesSinceBreak >= 20 || continuousActiveMinutes >= 45;

      if (timeConditionMet) {
        status = "break-suggested";
        suggestion = "You might be getting tired. Consider a short break.";
        statusText = "Break suggested";
        this.checkSoftSuggestionNotification(suggestion);
      } else {
        status = "normal";
        statusText = "Long blink noted";
      }
    } else {
      status = "normal";
      statusText = "Eye rest: Balanced";
    }

    // Update State
    State.fatiguePerclos = Math.round(perclosRatio * 100);
    State.fatigueEyeClosedDuration = Math.round(this.currentClosureDurationMs);
    State.fatigueSuggestion = suggestion;
    State.notify();

    const metrics: FatigueMetrics = {
      eyeBlinkLeft,
      eyeBlinkRight,
      eyesClosed: isClosed,
      eyeClosedDurationMs: this.currentClosureDurationMs,
      perclosRatio,
      continuousActiveMinutes,
      minutesSinceBreak,
      suggestion,
      status,
      statusText,
    };

    this.emitMetrics(metrics);
  }

  private handleUnavailable() {
    this.eyeClosureStartedAt = null;
    this.currentClosureDurationMs = 0;
    State.fatiguePerclos = 0;
    State.fatigueEyeClosedDuration = 0;
    State.fatigueSuggestion = null;
    State.notify();

    const metrics: FatigueMetrics = {
      eyeBlinkLeft: 0,
      eyeBlinkRight: 0,
      eyesClosed: false,
      eyeClosedDurationMs: 0,
      perclosRatio: 0,
      continuousActiveMinutes: Math.floor((Date.now() - this.appStartTime) / (60 * 1000)),
      minutesSinceBreak: 0,
      suggestion: null,
      status: "unavailable",
      statusText: "Facial analysis: unavailable",
    };

    this.emitMetrics(metrics);
  }

  private checkSoftSuggestionNotification(message: string) {
    const cooldownMs = this.config.demoMode
      ? 15 * 1000
      : Math.max(1, this.config.cooldownMinutes) * 60 * 1000;
    const now = Date.now();

    if (now - this.lastNotificationAt < cooldownMs) return;

    this.lastNotificationAt = now;
    Sound.play("yawn");

    void Platform.notify("Notch Companion 🌿", {
      body: message,
      icon: "/mochi.png",
    });
  }
}

export const FatigueEngine = new FatigueEngineImpl();

