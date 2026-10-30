// Task Manager & Reminder Engine — CRUD, filtering (Today, Upcoming, Overdue),
// timestamped duplicate-safe reminders (one-time, daily, weekdays), and local storage persistence.

import { State } from "./state";
import { Sound } from "./sound";
import { sendNotification } from "./focus";

export type TaskPriority = "low" | "med" | "high";
export type ReminderFrequency = "none" | "once" | "daily" | "weekdays";

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:mm
  done: boolean;
  completedAt?: number;
  reminderType: ReminderFrequency;
  reminderTime: string; // HH:mm
  lastReminderFiredAt?: number; // timestamp ms — prevents duplicate reminders after restart or resume!
  createdAt: number;
}

const STORAGE_KEY = "notch_tasks_v1";

function getTodayDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function isOverdue(task: TaskItem): boolean {
  if (task.done) return false;
  const now = new Date();
  const due = new Date(`${task.dueDate}T${task.dueTime || "23:59"}:00`);
  return now.getTime() > due.getTime();
}

export function isToday(task: TaskItem): boolean {
  const today = getTodayDateStr(0);
  return task.dueDate === today;
}

export function isUpcoming(task: TaskItem): boolean {
  if (task.done) return false;
  const today = getTodayDateStr(0);
  return task.dueDate > today;
}

const SEED_TASKS: TaskItem[] = [
  {
    id: "task-1",
    title: "Review quarterly project plan",
    description: "Align on Q4 milestones and resource budget with design leads.",
    priority: "high",
    dueDate: getTodayDateStr(0),
    dueTime: "14:00",
    done: false,
    reminderType: "daily",
    reminderTime: "14:00",
    createdAt: Date.now() - 3600000 * 5,
  },
  {
    id: "task-2",
    title: "Calibrate monitor height & chair posture",
    description: "Ensure top third of screen is at eye level for ergonomic alignment.",
    priority: "high",
    dueDate: getTodayDateStr(0),
    dueTime: "09:00", // Earlier today → Overdue demo!
    done: false,
    reminderType: "once",
    reminderTime: "09:00",
    createdAt: Date.now() - 3600000 * 8,
  },
  {
    id: "task-3",
    title: "Team sync & design review",
    description: "Walk through ergonomics companion UX prototype with pair developers.",
    priority: "med",
    dueDate: getTodayDateStr(0),
    dueTime: "16:30",
    done: false,
    reminderType: "once",
    reminderTime: "16:30",
    createdAt: Date.now() - 3600000 * 3,
  },
  {
    id: "task-4",
    title: "Read ergonomics research paper",
    description: "Study posture fatigue curves and recommended 20-20-20 eye break intervals.",
    priority: "low",
    dueDate: getTodayDateStr(1), // Tomorrow
    dueTime: "11:00",
    done: false,
    reminderType: "none",
    reminderTime: "11:00",
    createdAt: Date.now() - 3600000 * 2,
  },
  {
    id: "task-5",
    title: "Weekly progress summary email",
    description: "Summarize sprint deliverables, posture stats, and weekly focus metrics.",
    priority: "med",
    dueDate: getTodayDateStr(3),
    dueTime: "17:00",
    done: false,
    reminderType: "weekdays",
    reminderTime: "17:00",
    createdAt: Date.now() - 3600000,
  },
];

class TaskManagerClass {
  tasks: TaskItem[] = [];
  private reminderTimerId: number | null = null;

  constructor() {
    this.load();
    this.startReminderLoop();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.tasks = JSON.parse(raw);
      } else {
        this.tasks = [...SEED_TASKS];
        this.save();
      }
    } catch (e) {
      console.warn("Failed to load tasks:", e);
      this.tasks = [...SEED_TASKS];
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tasks));
      State.notify();
    } catch (e) {
      console.warn("Failed to save tasks:", e);
    }
  }

  resetToSeed() {
    this.tasks = SEED_TASKS.map((t) => ({ ...t }));
    this.save();
  }

  createTask(data: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueDate?: string;
    dueTime?: string;
    reminderType?: ReminderFrequency;
    reminderTime?: string;
  }): TaskItem {
    const newTask: TaskItem = {
      id: `task-${Date.now()}`,
      title: data.title.trim(),
      description: data.description?.trim() ?? "",
      priority: data.priority ?? "med",
      dueDate: data.dueDate ?? getTodayDateStr(0),
      dueTime: data.dueTime ?? "12:00",
      done: false,
      reminderType: data.reminderType ?? "none",
      reminderTime: data.reminderTime ?? data.dueTime ?? "12:00",
      createdAt: Date.now(),
    };

    this.tasks.unshift(newTask);
    this.save();
    return newTask;
  }

  updateTask(id: string, updates: Partial<TaskItem>): TaskItem | null {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return null;

    this.tasks[idx] = { ...this.tasks[idx], ...updates };
    if (State.activeTaskId === id && updates.title) {
      State.activeTaskTitle = updates.title;
    }

    this.save();
    return this.tasks[idx];
  }

  toggleTask(id: string): TaskItem | null {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;

    task.done = !task.done;
    task.completedAt = task.done ? Date.now() : undefined;

    // If active task was completed, detach it or link to next available
    if (task.done && State.activeTaskId === id) {
      const next = this.tasks.find((t) => !t.done);
      State.activeTaskId = next?.id ?? null;
      State.activeTaskTitle = next?.title ?? null;
    }

    this.save();
    return task;
  }

  deleteTask(id: string): boolean {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return false;

    this.tasks.splice(idx, 1);
    if (State.activeTaskId === id) {
      const next = this.tasks.find((t) => !t.done);
      State.activeTaskId = next?.id ?? null;
      State.activeTaskTitle = next?.title ?? null;
    }

    this.save();
    return true;
  }

  getFilteredTasks(filter: "all" | "today" | "upcoming" | "overdue" | "done"): TaskItem[] {
    switch (filter) {
      case "today":
        return this.tasks.filter((t) => !t.done && (isToday(t) || isOverdue(t)));
      case "upcoming":
        return this.tasks.filter((t) => !t.done && isUpcoming(t));
      case "overdue":
        return this.tasks.filter((t) => isOverdue(t));
      case "done":
        return this.tasks.filter((t) => t.done);
      case "all":
      default:
        return this.tasks;
    }
  }

  getPendingCount(): number {
    return this.tasks.filter((t) => !t.done).length;
  }

  getOverdueCount(): number {
    return this.tasks.filter((t) => isOverdue(t)).length;
  }

  private startReminderLoop() {
    if (this.reminderTimerId != null) window.clearInterval(this.reminderTimerId);
    this.reminderTimerId = window.setInterval(() => this.checkReminders(), 10_000);
    // Immediate check on boot
    this.checkReminders();
  }

  checkReminders() {
    const now = new Date();
    const nowMs = now.getTime();
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon ... 5 = Fri, 6 = Sat
    const isWeekday = currentDay >= 1 && currentDay <= 5;
    const startOfDayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    for (const task of this.tasks) {
      if (task.done || task.reminderType === "none") continue;

      // 1. One-time reminder
      if (task.reminderType === "once") {
        const dueMs = new Date(`${task.dueDate}T${task.reminderTime || task.dueTime || "12:00"}:00`).getTime();
        if (nowMs >= dueMs) {
          // Check if already fired for this scheduled timestamp
          if (!task.lastReminderFiredAt || task.lastReminderFiredAt < dueMs) {
            this.fireReminder(task);
          }
        }
      }

      // 2. Daily recurring reminder
      else if (task.reminderType === "daily") {
        const [hh, mm] = (task.reminderTime || "12:00").split(":").map(Number);
        const scheduledMs = startOfDayMs + (hh * 60 + mm) * 60 * 1000;
        if (nowMs >= scheduledMs) {
          // Has it fired today yet?
          if (!task.lastReminderFiredAt || task.lastReminderFiredAt < startOfDayMs) {
            this.fireReminder(task);
          }
        }
      }

      // 3. Weekdays recurring reminder
      else if (task.reminderType === "weekdays" && isWeekday) {
        const [hh, mm] = (task.reminderTime || "12:00").split(":").map(Number);
        const scheduledMs = startOfDayMs + (hh * 60 + mm) * 60 * 1000;
        if (nowMs >= scheduledMs) {
          if (!task.lastReminderFiredAt || task.lastReminderFiredAt < startOfDayMs) {
            this.fireReminder(task);
          }
        }
      }
    }
  }

  private fireReminder(task: TaskItem) {
    task.lastReminderFiredAt = Date.now();
    this.save();

    Sound.play("question");
    sendNotification(
      `Task Reminder 🔔 [${task.priority.toUpperCase()}]`,
      `${task.title}${task.dueTime ? ` is due at ${task.dueTime}` : " is due now!"}`,
    );
  }
}

export const TaskManager = new TaskManagerClass();

