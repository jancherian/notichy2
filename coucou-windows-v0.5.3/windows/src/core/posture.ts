import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { State } from "./state";
import { Sound } from "./sound";
import { FatigueEngine } from "./fatigue";
import { Platform } from "./platform";

export type PostureStatus = "good" | "needs-attention" | "unavailable";

export interface PostureMetrics {
  forwardHeadRatio: number;
  shoulderTiltDeg: number;
  slouchRatio: number;
  visibilityScore: number;
  isSlouching: boolean;
  isHeadForward: boolean;
  isShoulderTilted: boolean;
  status: PostureStatus;
  statusText: string;
}

export interface PostureBaseline {
  slouchRatio: number;
  forwardHeadRatio: number;
  shoulderTiltDeg: number;
  calibratedAt: number;
}

export interface PostureConfig {
  fps: number;
  demoMode: boolean;
  sensitivity: "low" | "medium" | "high";
  cooldownMinutes: number;
  showPreview: boolean;
}

const STORAGE_KEYS = {
  ENABLED: "notch_posture_enabled_v1",
  BASELINE: "notch_posture_baseline_v1",
  CONFIG: "notch_posture_config_v1",
};

class PostureEngineImpl {
  private landmarker: PoseLandmarker | null = null;
  private initializingLandmarker: Promise<PoseLandmarker | null> | null = null;
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private animFrameId: number | null = null;
  private loopTimer: number | null = null;
  private isProcessing = false;

  private badPostureStartedAt: number | null = null;
  private lastWarningAt: number = 0;
  private currentMetrics: PostureMetrics | null = null;
  private baseline: PostureBaseline | null = null;
  private cameraError: string | null = null;

  private listeners = new Set<(metrics: PostureMetrics | null) => void>();

  config: PostureConfig = {
    fps: 5,
    demoMode: false,
    sensitivity: "medium",
    cooldownMinutes: 1,
    showPreview: true,
  };

  constructor() {
    this.loadPersisted();
  }

  private loadPersisted() {
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (savedConfig) {
        this.config = { ...this.config, ...JSON.parse(savedConfig) };
        State.postureDemoMode = this.config.demoMode;
        State.postureSensitivity = this.config.sensitivity;
        State.postureCooldownMinutes = this.config.cooldownMinutes;
      }

      const savedBaseline = localStorage.getItem(STORAGE_KEYS.BASELINE);
      if (savedBaseline) {
        this.baseline = JSON.parse(savedBaseline);
        State.postureCalibrated = true;
      }
    } catch (e) {
      console.warn("[PostureEngine] Error loading stored posture settings:", e);
    }
  }

  private saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    } catch {
      /* ignore */
    }
  }

  addListener(fn: (m: PostureMetrics | null) => void) {
    this.listeners.add(fn);
    fn(this.currentMetrics);
    return () => this.listeners.delete(fn);
  }

  private emitMetrics(m: PostureMetrics | null) {
    this.currentMetrics = m;
    for (const fn of this.listeners) {
      try {
        fn(m);
      } catch (err) {
        console.error("[PostureEngine] listener error:", err);
      }
    }
  }

  getMetrics(): PostureMetrics | null {
    return this.currentMetrics;
  }

  getBaseline(): PostureBaseline | null {
    return this.baseline;
  }

  getCameraError(): string | null {
    return this.cameraError;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoEl;
  }

  setDemoMode(enabled: boolean) {
    this.config.demoMode = enabled;
    State.postureDemoMode = enabled;
    this.saveConfig();
    State.notify();
  }

  setSensitivity(s: "low" | "medium" | "high") {
    this.config.sensitivity = s;
    State.postureSensitivity = s;
    this.saveConfig();
    State.notify();
  }

  setCooldown(mins: number) {
    this.config.cooldownMinutes = mins;
    State.postureCooldownMinutes = mins;
    this.saveConfig();
    State.notify();
  }

  calibrate(): { success: boolean; message: string } {
    if (!this.currentMetrics || this.currentMetrics.status === "unavailable") {
      return {
        success: false,
        message: "Unable to calibrate: no clear pose detected. Ensure you are centered in camera.",
      };
    }

    this.baseline = {
      slouchRatio: this.currentMetrics.slouchRatio,
      forwardHeadRatio: this.currentMetrics.forwardHeadRatio,
      shoulderTiltDeg: this.currentMetrics.shoulderTiltDeg,
      calibratedAt: Date.now(),
    };

    try {
      localStorage.setItem(STORAGE_KEYS.BASELINE, JSON.stringify(this.baseline));
    } catch (e) {
      console.warn("Failed to persist posture baseline:", e);
    }

    State.postureCalibrated = true;
    this.badPostureStartedAt = null;
    Sound.play("approve");
    State.notify();

    return {
      success: true,
      message: "Baseline calibrated! Notch is now tuned to your optimal upright posture.",
    };
  }

  resetCalibration() {
    this.baseline = null;
    try {
      localStorage.removeItem(STORAGE_KEYS.BASELINE);
    } catch {
      /* ignore */
    }
    State.postureCalibrated = false;
    State.notify();
  }

  private async ensureLandmarker(): Promise<PoseLandmarker | null> {
    if (this.landmarker) return this.landmarker;
    if (this.initializingLandmarker) return this.initializingLandmarker;

    this.initializingLandmarker = (async () => {
      try {
        const wasmBase = new URL("wasm/", document.baseURI).href;
        const vision = await FilesetResolver.forVisionTasks(wasmBase);

        const modelPath = new URL("models/pose_landmarker_lite.task", document.baseURI).href;

        // Try GPU first, fall back to CPU seamlessly
        let lm: PoseLandmarker;
        try {
          lm = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (gpuErr) {
          console.warn("[PostureEngine] GPU delegate unavailable, trying CPU:", gpuErr);
          lm = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        }

        this.landmarker = lm;
        return lm;
      } catch (err) {
        console.error("[PostureEngine] Failed to load local PoseLandmarker:", err);
        this.cameraError = "Failed to load posture vision model locally.";
        return null;
      } finally {
        this.initializingLandmarker = null;
      }
    })();

    return this.initializingLandmarker;
  }

  async start(): Promise<boolean> {
    this.cameraError = null;

    try {
      // 1. Acquire Webcam Stream
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.cameraError = "Camera access API is not supported in this environment.";
        State.cameraActive = false;
        State.postureStatus = "unavailable";
        State.notify();
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 },
        },
        audio: false,
      });

      this.stream = stream;

      // 2. Setup hidden/preview Video Element
      let video = this.videoEl;
      if (!video) {
        video = document.createElement("video");
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.muted = true;
        video.style.display = "none";
        document.body.appendChild(video);
        this.videoEl = video;
      }

      video.srcObject = stream;
      await video.play();

      // 3. Load Pose Model
      const lm = await this.ensureLandmarker();
      if (!lm) {
        this.stop();
        return false;
      }

      State.cameraActive = true;
      State.postureStatus = "good";
      State.postureDetails = "Analyzing posture...";
      State.notify();

      // 4. Start Throttled Inference Loop
      this.startLoop();
      return true;
    } catch (err: any) {
      console.warn("[PostureEngine] Camera start failed:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        this.cameraError = "Camera permission was denied. Notch will continue without camera.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        this.cameraError = "No camera found on this device. Notch will continue normally.";
      } else {
        this.cameraError = `Camera error: ${err.message || "Unable to open camera"}`;
      }
      this.stop();
      return false;
    }
  }

  stop() {
    // Release video tracks immediately
    if (this.stream) {
      try {
        for (const track of this.stream.getTracks()) {
          track.stop();
        }
      } catch {
        /* ignore */
      }
      this.stream = null;
    }

    if (this.videoEl) {
      try {
        this.videoEl.srcObject = null;
        this.videoEl.remove();
      } catch {
        /* ignore */
      }
      this.videoEl = null;
    }

    if (this.animFrameId != null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.loopTimer != null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }

    this.isProcessing = false;
    this.badPostureStartedAt = null;
    FatigueEngine.reset();
    State.cameraActive = false;
    State.postureStatus = "unavailable";
    State.postureDetails = "Camera off";
    State.notify();
    this.emitMetrics(null);
  }

  private startLoop() {
    const frameIntervalMs = Math.round(1000 / Math.max(1, this.config.fps));

    const tick = async () => {
      if (!State.cameraActive || !this.stream || !this.videoEl) return;

      // When the island is actively expanding/collapsing, skip inference to ensure 60fps animation
      if (State.isGeometryAnimating) {
        this.loopTimer = window.setTimeout(() => {
          this.animFrameId = requestAnimationFrame(tick);
        }, 80);
        return;
      }

      if (!this.isProcessing && this.videoEl.readyState >= 2 && this.landmarker) {
        this.isProcessing = true;
        try {
          const timestamp = performance.now();
          const result = this.landmarker.detectForVideo(this.videoEl, timestamp);
          this.processResult(result);
          if (FatigueEngine.config.enabled) {
            void FatigueEngine.processFrame(this.videoEl, timestamp);
          }
        } catch (err) {
          console.warn("[PostureEngine] Inference error:", err);
        } finally {
          this.isProcessing = false;
        }
      }

      // Throttle when collapsed to ~2 fps (500ms) to conserve CPU/battery; full 5 fps when open
      const nextDelay = State.mode === "expanded" ? frameIntervalMs : Math.max(frameIntervalMs, 500);
      this.loopTimer = window.setTimeout(() => {
        this.animFrameId = requestAnimationFrame(tick);
      }, nextDelay);
    };

    tick();
  }

  private processResult(result: PoseLandmarkerResult) {
    if (!result.landmarks || result.landmarks.length === 0 || !result.landmarks[0]) {
      this.handleUnavailable("No pose detected in camera frame");
      return;
    }

    const landmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks?.[0];

    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    if (!nose || !leftShoulder || !rightShoulder) {
      this.handleUnavailable("Key posture landmarks unavailable");
      return;
    }

    const noseVis = nose.visibility ?? 1;
    const lsVis = leftShoulder.visibility ?? 1;
    const rsVis = rightShoulder.visibility ?? 1;

    const avgVis = (noseVis + lsVis + rsVis) / 3;
    if (avgVis < 0.4 || lsVis < 0.35 || rsVis < 0.35 || noseVis < 0.35) {
      this.handleUnavailable("Posture: unavailable (low visibility)");
      return;
    }

    // Geometry:
    const dx = rightShoulder.x - leftShoulder.x;
    const dy = rightShoulder.y - leftShoulder.y;
    const shoulderWidth = Math.hypot(dx, dy);

    if (shoulderWidth < 0.08) {
      this.handleUnavailable("Subject too far from camera");
      return;
    }

    // 1. Shoulder Tilt Angle in degrees from horizontal
    const shoulderTiltDeg = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI));

    // 2. Slouch / Vertical drop (nose to shoulder midpoint)
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const noseShoulderDist = shoulderMidY - nose.y;
    const slouchRatio = noseShoulderDist / shoulderWidth;

    // 3. Forward head
    let forwardHeadRatio = 0;
    if (worldLandmarks && worldLandmarks[0] && worldLandmarks[11] && worldLandmarks[12]) {
      const wShoulderZ = (worldLandmarks[11].z + worldLandmarks[12].z) / 2;
      forwardHeadRatio = Math.max(0, wShoulderZ - worldLandmarks[0].z);
    } else {
      const earMidY = (leftEar && rightEar) ? (leftEar.y + rightEar.y) / 2 : (leftEar?.y ?? rightEar?.y ?? nose.y);
      forwardHeadRatio = Math.abs(shoulderMidY - earMidY) / shoulderWidth;
    }

    // Baseline comparison
    const base = this.baseline ?? {
      slouchRatio: 0.72,
      forwardHeadRatio: 0.12,
      shoulderTiltDeg: 0,
      calibratedAt: 0,
    };

    const slouchDelta = base.slouchRatio - slouchRatio;
    const tiltDelta = Math.abs(shoulderTiltDeg - base.shoulderTiltDeg);
    const forwardHeadDelta = Math.abs(forwardHeadRatio - base.forwardHeadRatio);

    // Tolerance thresholds according to sensitivity
    let maxTilt = 10;
    let maxSlouch = 0.09;
    let maxForwardHead = 0.12;

    if (this.config.sensitivity === "low") {
      maxTilt = 15;
      maxSlouch = 0.14;
      maxForwardHead = 0.17;
    } else if (this.config.sensitivity === "high") {
      maxTilt = 6;
      maxSlouch = 0.06;
      maxForwardHead = 0.08;
    }

    const isShoulderTilted = tiltDelta > maxTilt;
    const isSlouching = slouchDelta > maxSlouch;
    const isHeadForward = forwardHeadDelta > maxForwardHead;

    const isBad = isShoulderTilted || isSlouching || isHeadForward;
    const violations: string[] = [];
    if (isSlouching) violations.push("Slouching");
    if (isShoulderTilted) violations.push("Shoulder tilt");
    if (isHeadForward) violations.push("Forward head");

    let status: PostureStatus = "good";
    let statusText = "Optimal posture";

    const holdRequiredMs = this.config.demoMode ? 5000 : 20000;

    if (isBad) {
      if (!this.badPostureStartedAt) {
        this.badPostureStartedAt = Date.now();
      }
      const heldMs = Date.now() - this.badPostureStartedAt;

      if (heldMs >= holdRequiredMs) {
        status = "needs-attention";
        statusText = `Attention: ${violations.join(" · ")}`;
        this.checkWarningNotification(violations.join(", "));
      } else {
        const remainingSec = Math.ceil((holdRequiredMs - heldMs) / 1000);
        status = "good";
        statusText = `${violations[0]} detected (${remainingSec}s)...`;
      }
    } else {
      this.badPostureStartedAt = null;
      status = "good";
      statusText = "Optimal posture";
    }

    // Update Notch State
    State.postureStatus = status;
    State.postureShoulderTilt = Math.round(shoulderTiltDeg * 10) / 10;
    State.postureSlouchRatio = Math.round(slouchRatio * 100) / 100;
    State.postureForwardHead = Math.round(forwardHeadRatio * 100) / 100;
    State.postureDetails = statusText;
    State.notify();

    const metrics: PostureMetrics = {
      forwardHeadRatio,
      shoulderTiltDeg,
      slouchRatio,
      visibilityScore: avgVis,
      isSlouching,
      isHeadForward,
      isShoulderTilted,
      status,
      statusText,
    };

    this.emitMetrics(metrics);
  }

  private handleUnavailable(reason: string) {
    this.badPostureStartedAt = null;
    State.postureStatus = "unavailable";
    State.postureDetails = reason;
    State.notify();

    const metrics: PostureMetrics = {
      forwardHeadRatio: 0,
      shoulderTiltDeg: 0,
      slouchRatio: 0,
      visibilityScore: 0,
      isSlouching: false,
      isHeadForward: false,
      isShoulderTilted: false,
      status: "unavailable",
      statusText: reason,
    };

    this.emitMetrics(metrics);
  }

  private checkWarningNotification(reasons: string) {
    const cooldownMs = Math.max(1, this.config.cooldownMinutes) * 60 * 1000;
    const now = Date.now();

    if (now - this.lastWarningAt < cooldownMs) return;

    this.lastWarningAt = now;
    Sound.play("annoyed");

    void Platform.notify("Notch Posture Check 🌿", {
      body: `Posture alert (${reasons}). Sit tall, relax your shoulders and take a breath!`,
      icon: "/mochi.png",
    });
  }
}

export const PostureEngine = new PostureEngineImpl();
