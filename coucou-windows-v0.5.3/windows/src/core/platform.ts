/**
 * Platform Adapter for Notch Companion
 * Bridges desktop capabilities (Tauri) and web preview capabilities (Browser).
 * Fulfills Stage 12A specification.
 */
import { IS_TAURI, Bridge } from "./bridge";

export interface PlatformAdapter {
  isTauri: boolean;

  // Local storage
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clearWithPrefix(prefix: string): void;

  // System / Web notifications
  notify(title: string, options?: { body?: string; icon?: string }): Promise<void>;
  requestNotificationPermission(): Promise<boolean>;

  // Autostart
  setAutostart(enabled: boolean): Promise<boolean>;
  getAutostart(): Promise<boolean>;

  // System Tray & Window management
  setCollapsed(collapsed: boolean): Promise<void>;
  setIslandRect(x: number, y: number, width: number, height: number): Promise<void>;
  openUrl(url: string): Promise<void>;
}

class TauriPlatform implements PlatformAdapter {
  readonly isTauri = true;

  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("[Platform] Storage write failed:", e);
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("[Platform] Storage delete failed:", e);
    }
  }

  clearWithPrefix(prefix: string): void {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
      for (const k of keys) localStorage.removeItem(k);
    } catch (e) {
      console.warn("[Platform] Storage clear failed:", e);
    }
  }

  async notify(title: string, options?: { body?: string; icon?: string }): Promise<void> {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(title, { body: options?.body, icon: options?.icon });
        } else if (Notification.permission !== "denied") {
          const perm = await Notification.requestPermission();
          if (perm === "granted") {
            new Notification(title, { body: options?.body, icon: options?.icon });
          }
        }
      }
    } catch (e) {
      console.warn("[Platform] Notification error:", e);
    }
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    try {
      const res = await Notification.requestPermission();
      return res === "granted";
    } catch {
      return false;
    }
  }

  async setAutostart(_enabled: boolean): Promise<boolean> {
    try {
      // Tauri bridge handles autostart via saveSettings
      return true;
    } catch {
      return false;
    }
  }

  async getAutostart(): Promise<boolean> {
    return false;
  }

  async setCollapsed(collapsed: boolean): Promise<void> {
    await Bridge.setCollapsed(collapsed);
  }

  async setIslandRect(x: number, y: number, width: number, height: number): Promise<void> {
    await Bridge.setIslandRect(x, y, width, height);
  }

  async openUrl(url: string): Promise<void> {
    await Bridge.openUrl(url);
  }
}

class BrowserPlatform implements PlatformAdapter {
  readonly isTauri = false;

  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("[Platform] Storage write failed:", e);
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("[Platform] Storage delete failed:", e);
    }
  }

  clearWithPrefix(prefix: string): void {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
      for (const k of keys) localStorage.removeItem(k);
    } catch (e) {
      console.warn("[Platform] Storage clear failed:", e);
    }
  }

  async notify(title: string, options?: { body?: string; icon?: string }): Promise<void> {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(title, { body: options?.body, icon: options?.icon });
        } else if (Notification.permission !== "denied") {
          const perm = await Notification.requestPermission();
          if (perm === "granted") {
            new Notification(title, { body: options?.body, icon: options?.icon });
          }
        }
      }
    } catch (e) {
      console.warn("[Platform] Browser notification error:", e);
    }
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    try {
      const res = await Notification.requestPermission();
      return res === "granted";
    } catch {
      return false;
    }
  }

  async setAutostart(_enabled: boolean): Promise<boolean> {
    console.info("[Platform] Autostart is only available in the Windows desktop app.");
    return false;
  }

  async getAutostart(): Promise<boolean> {
    return false;
  }

  async setCollapsed(_collapsed: boolean): Promise<void> {
    // In web preview, window does not collapse to 0 size
  }

  async setIslandRect(_x: number, _y: number, _width: number, _height: number): Promise<void> {
    // In web preview, layout is managed in DOM
  }

  async openUrl(url: string): Promise<void> {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export const Platform: PlatformAdapter = IS_TAURI ? new TauriPlatform() : new BrowserPlatform();
