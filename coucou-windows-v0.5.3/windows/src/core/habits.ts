import { Sound } from "./sound";
import { State } from "./state";

export type HabitFrequency = "daily" | "weekdays" | "custom";

export interface HabitItem {
  id: string;
  title: string;
  icon: string;
  frequency: HabitFrequency;
  customDays?: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
  completedDates: string[]; // "YYYY-MM-DD"
  paused: boolean;
  archived: boolean;
  createdAt: number;
}

const STORAGE_KEY = "notch_habits_v1";

function getLocalDateString(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPastDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return getLocalDateString(d);
}

function isDayScheduled(habit: HabitItem, date: Date): boolean {
  const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
  if (habit.frequency === "daily") return true;
  if (habit.frequency === "weekdays") return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (habit.frequency === "custom" && habit.customDays) {
    return habit.customDays.includes(dayOfWeek);
  }
  return true;
}

class HabitManagerImpl {
  private habits: HabitItem[] = [];
  private listeners = new Set<() => void>();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.habits = JSON.parse(raw);
        return;
      }
    } catch (e) {
      console.warn("[HabitManager] Failed to parse stored habits:", e);
    }
    this.seedDemoHabits();
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.habits));
    } catch {
      /* ignore */
    }
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
      } catch (err) {
        console.error(err);
      }
    }
    State.notify();
  }

  private seedDemoHabits() {
    const today = getLocalDateString();
    const d1 = getPastDateString(1);
    const d2 = getPastDateString(2);
    const d3 = getPastDateString(3);
    const d4 = getPastDateString(4);
    const d5 = getPastDateString(5);
    const d6 = getPastDateString(6);

    this.habits = [
      {
        id: "habit-1",
        title: "Morning Posture Stretch",
        icon: "🧘",
        frequency: "daily",
        completedDates: [d5, d4, d3, d2, d1, today],
        paused: false,
        archived: false,
        createdAt: Date.now() - 10 * 86400 * 1000,
      },
      {
        id: "habit-2",
        title: "Drink 2L Fresh Water",
        icon: "💧",
        frequency: "daily",
        completedDates: [d6, d5, d4, d3, d2, d1, today],
        paused: false,
        archived: false,
        createdAt: Date.now() - 12 * 86400 * 1000,
      },
      {
        id: "habit-3",
        title: "Read 20 Mins",
        icon: "📖",
        frequency: "daily",
        completedDates: [d5, d4, d3, d2, d1],
        paused: false,
        archived: false,
        createdAt: Date.now() - 8 * 86400 * 1000,
      },
      {
        id: "habit-4",
        title: "Lunch Walk & Mobility",
        icon: "🚶",
        frequency: "daily",
        // Missed yesterday (d1)! Completed d4, d3, d2. Streak reset & missed indicator visible!
        completedDates: [d4, d3, d2],
        paused: false,
        archived: false,
        createdAt: Date.now() - 7 * 86400 * 1000,
      },
    ];
    this.save();
  }

  resetDemoData() {
    this.seedDemoHabits();
  }

  getHabits(filter: "active" | "paused" | "all" = "active"): HabitItem[] {
    return this.habits.filter((h) => {
      if (h.archived) return false;
      if (filter === "active") return !h.paused;
      if (filter === "paused") return h.paused;
      return true;
    });
  }

  createHabit(title: string, icon = "🌿", frequency: HabitFrequency = "daily"): HabitItem {
    const newHabit: HabitItem = {
      id: `habit-${Date.now()}`,
      title: title.trim(),
      icon,
      frequency,
      completedDates: [],
      paused: false,
      archived: false,
      createdAt: Date.now(),
    };
    this.habits.unshift(newHabit);
    this.save();
    return newHabit;
  }

  toggleToday(id: string): boolean {
    const habit = this.habits.find((h) => h.id === id);
    if (!habit) return false;

    const todayStr = getLocalDateString();
    const idx = habit.completedDates.indexOf(todayStr);

    if (idx >= 0) {
      habit.completedDates.splice(idx, 1);
    } else {
      habit.completedDates.push(todayStr);
      Sound.play("finish");
    }

    this.save();
    return idx < 0;
  }

  isCompletedToday(habit: HabitItem): boolean {
    const todayStr = getLocalDateString();
    return habit.completedDates.includes(todayStr);
  }

  togglePause(id: string) {
    const habit = this.habits.find((h) => h.id === id);
    if (!habit) return;
    habit.paused = !habit.paused;
    this.save();
  }

  deleteHabit(id: string) {
    const idx = this.habits.findIndex((h) => h.id === id);
    if (idx >= 0) {
      this.habits.splice(idx, 1);
      this.save();
    }
  }

  /**
   * Calculates current streak in consecutive scheduled days.
   * Missed days are never auto-completed.
   */
  calculateCurrentStreak(habit: HabitItem): number {
    const completedSet = new Set(habit.completedDates);
    let streak = 0;
    const now = new Date();

    // Check if today is completed or not yet completed
    const todayStr = getLocalDateString(now);
    const todayScheduled = isDayScheduled(habit, now);
    const todayDone = completedSet.has(todayStr);

    if (todayDone) {
      streak++;
    }

    // Step backwards day by day from yesterday
    let checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 1);

    while (true) {
      if (isDayScheduled(habit, checkDate)) {
        const dateStr = getLocalDateString(checkDate);
        if (completedSet.has(dateStr)) {
          streak++;
        } else {
          // Missed scheduled day: streak ends!
          break;
        }
      }
      checkDate.setDate(checkDate.getDate() - 1);
      // Bound check to prevent infinite loop
      if (streak > 365 || Date.now() - checkDate.getTime() > 400 * 86400 * 1000) {
        break;
      }
    }

    // If today is scheduled and NOT completed, but yesterday was completed,
    // current streak is alive from yesterday until today ends.
    if (!todayDone && todayScheduled && streak === 0) {
      // Check if yesterday was completed
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      if (isDayScheduled(habit, yDate) && completedSet.has(getLocalDateString(yDate))) {
        let yStreak = 0;
        let yCheck = new Date(yDate);
        while (true) {
          if (isDayScheduled(habit, yCheck)) {
            const str = getLocalDateString(yCheck);
            if (completedSet.has(str)) {
              yStreak++;
            } else {
              break;
            }
          }
          yCheck.setDate(yCheck.getDate() - 1);
          if (yStreak > 365) break;
        }
        return yStreak;
      }
    }

    return streak;
  }

  /**
   * Calculates the best historical streak.
   */
  calculateBestStreak(habit: HabitItem): number {
    const current = this.calculateCurrentStreak(habit);
    // Rough estimate from completed dates count or current
    return Math.max(current, Math.min(30, habit.completedDates.length));
  }

  /**
   * Returns a 7-day completion status array for the last 7 calendar days ending today.
   */
  getWeeklyHistory(habit: HabitItem): Array<{
    dayLabel: string;
    dateStr: string;
    isToday: boolean;
    scheduled: boolean;
    completed: boolean;
    missed: boolean;
  }> {
    const result = [];
    const completedSet = new Set(habit.completedDates);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const dayOfWeek = d.getDay();
      const scheduled = isDayScheduled(habit, d);
      const completed = completedSet.has(dateStr);
      const isToday = i === 0;
      const isPast = i > 0;
      const missed = isPast && scheduled && !completed;

      result.push({
        dayLabel: dayNames[dayOfWeek][0], // "M", "T", "W"...
        dateStr,
        isToday,
        scheduled,
        completed,
        missed,
      });
    }

    return result;
  }

  getTotalStats(): { total: number; completedToday: number; maxStreak: number } {
    const active = this.getHabits("active");
    let completedToday = 0;
    let maxStreak = 0;

    for (const h of active) {
      if (this.isCompletedToday(h)) completedToday++;
      const s = this.calculateCurrentStreak(h);
      if (s > maxStreak) maxStreak = s;
    }

    return {
      total: active.length,
      completedToday,
      maxStreak,
    };
  }
}

export const HabitManager = new HabitManagerImpl();
