// Island views — DOM ports of IslandViewContent.swift. Paddings, font sizes,
// colours and wording are copied from the Swift views so both platforms read
// identically.

import { h, svg, clear, dot } from "./dom";
import { ICONS } from "./icons";
import { Ticker } from "./ticker";
import { State, type AgentTask } from "../core/state";
import { washRGBA, type IslandViewName, type Wash } from "../core/layout";
import { createMiniBot, pruneMiniBots } from "../mochi/minibots";
import { buildPrompt } from "./chat";
import { buildChoose, buildUpload, buildUploading } from "./upload";
import { renderIntegrationCard, type IntegrationCardHooks } from "./integrations";
import { highlightRow, listRows, openRow } from "./github";
import { pillDefinition, sessionSubtitle } from "../core/pills";
import {
  PlanCard, planCardOpen,
} from "./usage";
import { buildDiffCard } from "./diff";
import { lastTextStep } from "../core/diff";
import { Bridge } from "../core/bridge";
import { buildRecap } from "./recap";
import { buildWardrobe } from "./wardrobe";
import { buildUpdate } from "./update";
import { buildWhatsNew } from "./whatsnew";
import { buildSpotifyCard, buildSpotifyPill, type SpotifyPillHost } from "./spotify";
import { SPOTIFY_ID } from "../core/spotify";
import { buildWhatsAppCard } from "./whatsapp";
import { WHATSAPP_ID } from "../core/whatsapp";
import type { Outfit, OutfitSelection } from "../mochi/wardrobe";
import { language, t, tl, type Msg } from "../i18n/i18n";
import type { ViewCommand } from "../island/shortcuts";
import { FocusEngine } from "../core/focus";
import { TaskManager, isOverdue, isToday } from "../core/tasks";
import { PostureEngine, type PostureMetrics } from "../core/posture";
import { FatigueEngine, type FatigueMetrics } from "../core/fatigue";
import { WellbeingBreakManager, BREAK_DEFINITIONS } from "../core/wellbeing-breaks";
import { HabitManager, type HabitFrequency } from "../core/habits";
import { NotchSettings } from "../core/notch-settings";
import { Sound } from "../core/sound";

export interface ViewActions {
  setView(v: IslandViewName): void;
  togglePin(): void;
  /** "Cancel" on a dropped file: forgets it and goes back home. */
  cancelDrop(): void;
  collapse(): void;
  /** Folds a waiting card to the compact island without answering it. */
  foldApproval(): void;
  setFocus(id: string): void;
  openTerminal(): void;
  /** The ↗ button: opens whatever the focused pill points at. */
  openTarget(): void;
  openUrl(url: string): void;
  decide(d: "allow" | "deny"): void;
  /** Answers the question Claude Code asked: question text → chosen label. */
  answer(answers: Record<string, string | string[]>): void;
  /** Hands the pending request back to the terminal. */
  answerInTerminal(): void;
  toggleSound(): void;
  setVolume(v: number): void;
  setAutoClose(seconds: number): void;
  openSettingsWindow(): void;
  blip(): void;
  /** Wardrobe click: keeps the outfit ("auto" and "none" included). */
  chooseOutfit(selection: OutfitSelection): void;
  /** Wardrobe hover: shows an outfit on Mochi without keeping it; null ends it. */
  previewOutfit(outfit: Outfit | null): void;
  /** The island takes the keyboard (a text field in a card) or gives it back. */
  keyboard(on: boolean): void;
  /** Something is being typed in a card: the island stays open until it is sent or cleared. */
  holdOpen(on: boolean): void;
}

export interface ViewHost {
  el: HTMLElement;
  sync(): void;
  /** Called when the view becomes active, for views with a text field. */
  focus?(): void;
  /** Called every frame while the view is on screen. True = needs another frame. */
  tick?(nowMs: number): boolean | void;
  /** Ctrl+O / Ctrl+E while the view is on screen (island/shortcuts.ts). */
  command?(command: ViewCommand): void;
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

function card(wash: Wash, ...children: (Node | string)[]): HTMLElement {
  const el = h("div", { class: wash ? "card wash" : "card" }, ...children);
  if (wash) el.style.setProperty("--wash", washRGBA(wash));
  return el;
}

function btn(
  label: string | Msg,
  kind: "primary" | "secondary",
  onClick: () => void,
  kbd?: string,
): HTMLElement {
  return h(
    "button",
    { class: `btn ${kind}`, onclick: onClick },
    h("span", { text: label }),
    kbd ? h("span", { class: "kbd", text: kbd }) : null,
  );
}

/** AgentWho — coloured dot + task name + grey label. */
function agentWho(task: AgentTask | null, label: string): HTMLElement {
  const row = h("div", { class: "who-row" });
  if (task) {
    row.append(dot(task.color, 8), h("span", { class: "n", text: task.name }));
  }
  row.append(h("span", { text: label }));
  return row;
}

function stack(padLeft: number, padRight: number, ...children: Node[]): HTMLElement {
  const el = h("div", { class: "stack" }, ...children);
  el.style.padding = `4px ${padRight}px 4px ${padLeft}px`;
  return el;
}

// ── Header ────────────────────────────────────────────────────────────────────

export function buildHeader(actions: ViewActions): ViewHost {
  function go(v: IslandViewName) {
    actions.blip();
    actions.setView(v);
  }

  const tabFocus = h("button", { class: "tab", title: "Focus" }, svg(ICONS.focus, 12), h("span", { text: "Focus" }));
  const tabTasks = h("button", { class: "tab", title: "Tasks" }, svg(ICONS.tasks, 12), h("span", { text: "Tasks" }));
  const tabHabits = h("button", { class: "tab", title: "Habits" }, svg(ICONS.habits, 12), h("span", { text: "Habits" }));
  const tabWellbeing = h("button", { class: "tab", title: "Wellbeing" }, svg(ICONS.wellbeing, 12), h("span", { text: "Wellbeing" }));
  const tabInsights = h("button", { class: "tab", title: "Insights" }, svg(ICONS.insights, 12), h("span", { text: "Insights" }));
  const tabSettings = h("button", { class: "tab", title: "Settings" }, svg(ICONS.gear, 12), h("span", { text: "Settings" }));

  tabFocus.onclick = () => go("focus");
  tabTasks.onclick = () => go("tasks");
  tabHabits.onclick = () => go("habits");
  tabWellbeing.onclick = () => go("wellbeing");
  tabInsights.onclick = () => go("insights");
  tabSettings.onclick = () => go("settings");

  const pinBtn = h("button", { class: "pin-btn", title: "Pin panel (Ctrl+P)", onclick: () => actions.togglePin() }, svg(ICONS.pin, 13));
  const soundBtn = h("button", { title: tl("Mute"), onclick: () => actions.toggleSound() }, svg(ICONS.speakerOn, 13));

  const topRow = h(
    "div",
    { class: "header-top" },
    h("div", { class: "tabs" }, tabFocus, tabTasks, tabHabits, tabWellbeing, tabInsights, tabSettings),
    h("div", { class: "header-actions" }, pinBtn, soundBtn),
  );

  const taskChip = h("button", { class: "overview-chip task-chip", onclick: () => go("tasks") });
  const timerChip = h("button", { class: "overview-chip timer-chip", onclick: () => go("focus") });
  const postureChip = h("button", { class: "overview-chip posture-chip", onclick: () => go("wellbeing") });

  const overviewStrip = h("div", { class: "overview-strip" }, taskChip, timerChip, postureChip);

  const el = h("div", { id: "header" }, topRow, overviewStrip);

  return {
    el,
    sync() {
      const v = State.view;
      tabFocus.classList.toggle("on", v === "focus" || v === "overview" || v === "empty");
      tabTasks.classList.toggle("on", v === "tasks");
      tabHabits.classList.toggle("on", v === "habits");
      tabWellbeing.classList.toggle("on", v === "wellbeing");
      tabInsights.classList.toggle("on", v === "insights");
      tabSettings.classList.toggle("on", v === "settings");

      pinBtn.classList.toggle("on", State.isPinned);
      clear(pinBtn);
      pinBtn.append(svg(State.isPinned ? ICONS.pinFill : ICONS.pin, 13));
      pinBtn.title = State.isPinned ? "Unpin panel (Ctrl+P)" : "Pin panel open (Ctrl+P)";

      clear(soundBtn);
      soundBtn.append(svg(State.settings.soundEnabled ? ICONS.speakerOn : ICONS.speakerOff, 13));

      // Sync task chip
      clear(taskChip);
      const taskLabel = State.activeTaskTitle ? State.activeTaskTitle : "No active task";
      taskChip.append(
        svg(ICONS.tasks, 11),
        h("span", { class: "chip-txt", text: taskLabel.length > 22 ? taskLabel.slice(0, 21) + "…" : taskLabel }),
      );

      // Sync timer chip
      clear(timerChip);
      const mins = Math.floor(State.timerSecondsLeft / 60);
      const secs = State.timerSecondsLeft % 60;
      const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      const timerStatus = State.timerRunning
        ? (State.timerMode === "work" ? "Focus" : "Break")
        : "Ready";
      timerChip.append(
        svg(ICONS.timer, 11),
        h("span", { class: "chip-txt", text: `${timeStr} · ${timerStatus}` }),
      );
      timerChip.classList.toggle("running", State.timerRunning);

      // Sync posture chip
      clear(postureChip);
      let camLabel = "Camera off";
      let camDot = "#64748b";
      if (State.cameraActive) {
        if (State.postureStatus === "good") {
          camLabel = "Posture: Good";
          camDot = "#22c55e";
        } else if (State.postureStatus === "needs-attention") {
          camLabel = "Needs attention";
          camDot = "#f59e0b";
        } else {
          camLabel = "Camera active";
          camDot = "#38bdf8";
        }
      }
      postureChip.append(
        dot(camDot, 6),
        h("span", { class: "chip-txt", text: camLabel }),
      );

      el.style.opacity = v === "confused" ? "0" : "1";
    },
  };
}

// ── Overview ──────────────────────────────────────────────────────────────────

function buildOverview(actions: ViewActions): ViewHost {
  /** The diff open in the left card (a FileDiff id), as activeDiffId on macOS. */
  let activeDiffId: number | null = null;
  const closeDiff = () => {
    if (activeDiffId == null) return;
    activeDiffId = null;
    State.notify();
  };
  const ticker = new Ticker((diffId) => {
    actions.blip();
    activeDiffId = diffId;
    State.notify();
  });
  const who = h("div", { class: "who" });
  const tickerBody = h("div", { class: "card-body" }, who, ticker.el);
  const leftBody = h("div", { class: "left-body" });
  const jump = h(
    "button",
    { class: "icon-btn jump", title: tl("Open"), onclick: () => actions.openTarget() },
    svg(ICONS.arrowUpRight, 8),
  );
  const left = card(null, leftBody, jump);
  const pills = h("div", { class: "pills" });
  const right = card(null, pills);
  // Opened from a plan pill in the header: stands in for the left card.
  const plan = new PlanCard();
  let planTimer: number | null = null;
  // Spotify's card and pill are kept and updated in place: the progress bar
  // runs on, and a slider being dragged must not be rebuilt under the pointer.
  const spotifyCard = buildSpotifyCard();
  let spotifyPill: SpotifyPillHost | null = null;
  // WhatsApp's card too: its reply field keeps the draft and the keyboard while messages arrive.
  const whatsappCard = buildWhatsAppCard({
    openSettings: () => actions.openSettingsWindow(),
    keyboard: (on) => actions.keyboard(on),
    holdOpen: (on) => actions.holdOpen(on),
  });

  const el = h("div", { class: "view overview" },
    h("div", { class: "left" }, left),
    h("div", { class: "right" }, right),
  );

  let pillIds = "";
  let detailOpen = false;
  let lastFocus: string | null = null;
  let mode: "ticker" | "card" | "plan" | "diff" | "spotify" | "whatsapp" | null = null;
  let cardKey = "";
  /** The list row highlighted at the last sync, to scroll only when it moves. */
  let shownSelection: number | null = null;

  // Leaving the overview or folding the island closes the diff, as on macOS.
  State.subscribe(() => {
    if (activeDiffId != null && (State.view !== "overview" || State.mode !== "expanded")) {
      activeDiffId = null;
    }
  });
  // Escape steps back out of the diff before it closes the island.
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || activeDiffId == null || State.view !== "overview") return;
      e.stopImmediatePropagation();
      closeDiff();
    },
    true,
  );

  const hooks: IntegrationCardHooks = {
    get detailOpen() {
      return detailOpen;
    },
    openDetail() {
      detailOpen = true;
      cardKey = "";
      State.notify();
    },
    closeDetail() {
      detailOpen = false;
      cardKey = "";
      State.notify();
    },
    openSettings: () => actions.openSettingsWindow(),
  };

  /** The countdowns move every 30 s while a card is open, and only then. */
  function syncPlanTimer(open: boolean) {
    const stop = () => {
      if (planTimer != null) window.clearInterval(planTimer);
      planTimer = null;
    };
    if (!open) return stop();
    if (planTimer != null) return;
    planTimer = window.setInterval(() => {
      if (planCardOpen() && State.mode === "expanded") State.notify();
      else stop();
    }, 30_000);
  }

  return {
    el,
    tick(nowMs: number) {
      if (mode !== "ticker") return false;
      ticker.tick(nowMs);
      return ticker.animating;
    },
    command(command) {
      if (command === "openSelection") {
        // Ctrl+O: what a click on the highlighted row does.
        if (mode !== "card" || State.cardSelection == null) return;
        openRow(listRows(leftBody)[State.cardSelection]);
        return;
      }
      // Ctrl+E (⌘E, islandToggleDiff): closes the diff that is open, else
      // opens the focused pill's latest edit.
      if (activeDiffId != null) {
        closeDiff();
        return;
      }
      const task = State.focusTask;
      const diffs = task ? State.sessionDiffs.get(task.id) : undefined;
      const last = diffs?.[diffs.length - 1];
      if (last?.id == null) return;
      activeDiffId = last.id;
      State.notify();
    },
    sync() {
      if (State.view === "overview") {
        actions.setView("focus");
        return;
      }
      const task = State.focusTask;
      if (task?.id !== lastFocus) {
        lastFocus = task?.id ?? null;
        detailOpen = false;
        activeDiffId = null;
        cardKey = "";
        mode = null;
      }

      // A workspace or agent pill with a live session keeps the ticker; every
      // other pill shows its own card, exactly like IntegrationCardView.
      const sessionActive = task != null && hasSessionTicker(task);

      const planOpen = planCardOpen();
      if (mode === "plan" && !planOpen) {
        mode = null;
        cardKey = "";
      }
      syncPlanTimer(planOpen);

      // A diff that has since been dropped (cap, expiry, session end) just closes.
      const diff = task && activeDiffId != null ? State.findDiff(task.id, activeDiffId) : null;
      if (!diff) activeDiffId = null;

      if (planOpen) {
        if (mode !== "plan") {
          clear(leftBody);
          leftBody.append(plan.el);
          mode = "plan";
        }
        plan.sync();
      } else if (task && diff) {
        const key = `diff~${task.id}~${diff.id}`;
        if (key !== cardKey) {
          cardKey = key;
          mode = "diff";
          clear(leftBody);
          leftBody.append(buildDiffCard(diff, {
            dismiss: () => {
              actions.blip();
              closeDiff();
            },
            open: (path) => void Bridge.openFileInVSCode(path),
          }));
        }
      } else if (task && sessionActive) {
        if (mode !== "ticker") {
          clear(leftBody);
          leftBody.append(tickerBody);
          mode = "ticker";
          cardKey = "";
        }
        clear(who);
        // The agent's name is already the pill's: the label says what kind of
        // pill it is, as on the Mac (PillDefinition.sessionSubtitle).
        who.append(
          dot(task.color, 7),
          h("span", { class: "name", text: task.name }),
          h("span", { class: "tool", text: t(sessionSubtitle(task.id)) }),
        );
        if (task.steps.length > 1) {
          who.append(h("span", {
            class: "count",
            text: `${Math.min(task.stepIndex + 1, task.steps.length)}/${task.steps.length}`,
          }));
        }
        ticker.sync(task);
      } else if (task && task.id === SPOTIFY_ID) {
        // Its own card for every state: playing, idle, not installed.
        if (mode !== "spotify") {
          clear(leftBody);
          leftBody.append(spotifyCard.el);
          mode = "spotify";
          cardKey = "";
        }
        spotifyCard.sync();
      } else if (task && task.id === WHATSAPP_ID) {
        // Its own card in every state: not linked, no message, conversations, one open.
        if (mode !== "whatsapp") {
          clear(leftBody);
          leftBody.append(whatsappCard.el);
          mode = "whatsapp";
          cardKey = "";
        }
        whatsappCard.sync();
      } else if (task) {
        const info = State.integrations[task.id];
        const key = [
          language(), task.id, task.color, detailOpen, task.state, task.steps.join("|"),
          info?.loaded, info?.error, info?.configured,
          JSON.stringify(info?.data ?? {}),
        ].join("~");
        if (key !== cardKey) {
          cardKey = key;
          mode = "card";
          clear(leftBody);
          leftBody.append(renderIntegrationCard(task, hooks));
        }
      }

      jump.style.display = detailOpen || mode === "plan" || mode === "diff" ? "none" : "";

      // Ctrl+↓ Ctrl+↑ walk the open GitHub list (cardItemCount / cardSelection).
      const rows = mode === "card" ? listRows(leftBody) : [];
      State.cardItemCount = rows.length;
      if (State.cardSelection != null && State.cardSelection >= rows.length) State.cardSelection = null;
      highlightRow(rows, State.cardSelection, State.cardSelection !== shownSelection);
      shownSelection = State.cardSelection;

      const others = State.otherTasks.slice(0, 4);
      const pillKey = others.map((t) => `${t.id}:${t.color}:${t.pillBadge ?? ""}`).join("|");
      if (pillKey !== pillIds) {
        pillIds = pillKey;
        clear(pills);
        spotifyPill = null;
        for (const t of others) {
          if (t.id === SPOTIFY_ID) {
            spotifyPill = buildSpotifyPill(t, () => actions.setFocus(t.id));
            pills.append(spotifyPill.el);
          } else {
            pills.append(buildPill(t, actions));
          }
        }
        pruneMiniBots();
      }
      spotifyPill?.sync();
    },
  };
}

/**
 * IntegrationCardView.agentSessionActive: a workspace tool or an agent — or
 * any other tagged agent — with something going on.
 */
export function hasSessionTicker(task: AgentTask): boolean {
  // A pill made for an agent's session (Gemini CLI, Codex… not declared) only
  // exists while that session does: it keeps the ticker from the first event.
  if (task.source === "agent" && !task.isIntegration) return true;
  const category = pillDefinition(task.id)?.category;
  const isSession = category === "workspace" || category === "agent" ||
    (category == null && task.id.startsWith("agent_"));
  return isSession && (task.state !== "idle" || task.steps.length > 0);
}

function buildPill(task: AgentTask, actions: ViewActions): HTMLElement {
  const label = task.id === "integration_claude" ? pillDefinition(task.id)!.name : task.name;
  const canvas = createMiniBot(task, 24);
  const pill = h(
    "div",
    { class: "pill", onclick: () => actions.setFocus(task.id) },
    canvas,
    h("span", { class: "lbl", text: label }),
  );
  pill.style.borderColor = `${task.color}24`;
  pill.addEventListener("mouseenter", () => {
    pill.style.background = `${task.color}2e`;
    pill.style.borderColor = `${task.color}8c`;
    pill.style.boxShadow = `0 2px 10px ${task.color}59`;
    (pill.querySelector(".lbl") as HTMLElement).style.color = lighten(task.color, 0.3);
  });
  pill.addEventListener("mouseleave", () => {
    pill.style.background = "";
    pill.style.borderColor = `${task.color}24`;
    pill.style.boxShadow = "";
    (pill.querySelector(".lbl") as HTMLElement).style.color = "";
  });

  if (task.pillBadge) {
    const colors = { approval: "#F5A524", finished: "#22C55E", error: "#F4505E" } as const;
    const icons = { approval: ICONS.bang, finished: ICONS.check, error: ICONS.xmark } as const;
    const inner = h("i", { style: `background:${colors[task.pillBadge]}` }, svg(icons[task.pillBadge], 6, { stroke: task.pillBadge === "finished" ? 3 : 0 }));
    const badge = h("div", { class: "pill-badge" }, inner);
    badge.style.boxShadow = `0 0 4px ${colors[task.pillBadge]}99`;
    pill.append(badge);
  }
  return pill;
}

function lighten(hex: string, amount: number): string {
  const v = parseInt(hex.replace("#", ""), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) =>
    Math.min(255, Math.round(x + amount * 255)),
  );
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ── Empty ─────────────────────────────────────────────────────────────────────

function buildEmpty(actions: ViewActions): ViewHost {
  return buildFocus(actions);
}

// ── Approval ──────────────────────────────────────────────────────────────────

/** How long a fresh permission card ignores clicks on its buttons. */
const CLICK_GUARD_MS = 600;

/**
 * The ⌃ in the corner of a waiting card: folds the island to its compact size
 * and leaves the request waiting — nothing is answered (Mac #290). Opening the
 * island again brings the card back.
 */
function foldButton(actions: ViewActions): HTMLElement {
  return h(
    "button",
    { class: "icon-btn fold", title: tl("Later — keep it waiting"), onclick: () => actions.foldApproval() },
    svg(ICONS.chevronUp, 8, { stroke: 2.4 }),
  );
}

function buildApproval(actions: ViewActions): ViewHost {
  const who = h("div");
  const code = h("div", { class: "code" });
  const row = h("div", { class: "actions" });
  const el = h("div", { class: "view" },
    card("amber", stack(116, 16, who, code, row), foldButton(actions)));
  let rowKey = "";
  // The card pops up under a cursor that was busy with something else: a click
  // meant for the window underneath must not land on Allow. Clicks in the first
  // moments after a new request appears are ignored.
  let shownFor: string | null = null;
  let shownAt = 0;
  const guarded = (d: "allow" | "deny") => () => {
    if (performance.now() - shownAt < CLICK_GUARD_MS) return;
    actions.decide(d);
  };
  return {
    el,
    sync() {
      const req = State.pendingApproval?.requestId ?? null;
      if (req !== shownFor) {
        shownFor = req;
        shownAt = performance.now();
      }
      clear(who);
      who.append(agentWho(State.focusTask, t("needs permission")));
      // The whole point of approving here rather than in the terminal: this line
      // is the command, the file path or the URL being authorised, not just the
      // name of the tool asking.
      code.textContent = State.pendingApproval?.command || State.pendingApproval?.tool || "…";
      // Two buttons, built once. Rebuilding them between a mouse-down and a
      // mouse-up would swallow the click, and there is nothing left to vary:
      // "Always" is gone until the remembered-rules list exists to back it.
      if (rowKey === "built") return;
      rowKey = "built";
      clear(row);
      row.append(
        btn(tl("Deny"), "secondary", guarded("deny"), "N"),
        btn(tl("Allow"), "primary", guarded("allow"), "Y"),
      );
    },
  };
}

// ── Question ──────────────────────────────────────────────────────────────────

function buildQuestion(actions: ViewActions): ViewHost {
  const who = h("div");
  const title = h("div", { class: "title question-text" });
  const row = h("div", { class: "actions options" });
  const fold = foldButton(actions);
  const el = h("div", { class: "view" }, card("cyan", stack(116, 16, who, title, row), fold));

  // Where we are in the request on screen: which question, what is answered so
  // far, and what is ticked in a pick-several question.
  let requestId = "";
  let index = 0;
  let answers: Record<string, string | string[]> = {};
  let picked = new Set<string>();
  // The buttons are only rebuilt when what they show changes: rebuilding them
  // between a mouse-down and a mouse-up would swallow the click.
  let rowKey = "";

  const next = (question: string, answer: string | string[], total: number) => {
    answers[question] = answer;
    picked = new Set();
    index += 1;
    if (index >= total) actions.answer(answers);
    else State.notify();
  };

  return {
    el,
    sync() {
      const questions = State.pendingApproval?.questions;
      clear(who);
      // Only a request that is waiting can be folded away and come back.
      fold.style.display = State.pendingApproval ? "" : "none";

      // A question that arrived as a notification has nothing to pick from.
      if (!questions) {
        who.append(agentWho(State.focusTask, t("is asking a question")));
        const task = State.focusTask;
        title.textContent = (task && lastTextStep(task.steps)) ?? t("Claude needs an answer.");
        if (rowKey !== "terminal") {
          rowKey = "terminal";
          clear(row);
          row.append(h("div", { class: "sub", text: tl("Answer it in your terminal.") }));
        }
        return;
      }

      if (State.pendingApproval!.requestId !== requestId) {
        requestId = State.pendingApproval!.requestId;
        index = 0;
        answers = {};
        picked = new Set();
      }
      const q = questions[Math.min(index, questions.length - 1)];
      const asking = questions.length > 1
        ? t("is asking ({index} of {total})", { index: index + 1, total: questions.length })
        : t("is asking");
      who.append(agentWho(State.focusTask, asking));
      title.textContent = q.question;
      title.title = q.question;

      const key = `${requestId}:${index}:${[...picked].join("|")}`;
      if (rowKey === key) return;
      rowKey = key;
      clear(row);
      for (const option of q.options) {
        const on = picked.has(option.label);
        const button = btn(option.label, on ? "primary" : "secondary", () => {
          if (!q.multiSelect) {
            next(q.question, option.label, questions.length);
            return;
          }
          if (on) picked.delete(option.label);
          else picked.add(option.label);
          State.notify();
        });
        if (option.description) button.title = option.description;
        row.append(button);
      }
      if (q.multiSelect) {
        const done = btn(tl("Done"), "primary", () => {
          if (picked.size > 0) next(q.question, [...picked], questions.length);
        });
        if (picked.size === 0) done.classList.add("off");
        row.append(done);
      }
      row.append(
        h("button", {
          class: "link-btn",
          style: "color:#8e939c",
          text: tl("Answer in terminal"),
          onclick: () => actions.answerInTerminal(),
        }),
      );
    },
  };
}

// ── Error ─────────────────────────────────────────────────────────────────────

function buildError(actions: ViewActions): ViewHost {
  const who = h("div");
  const title = h("div", { class: "title" });
  const detail = h("div", { class: "detail" });
  const row = h("div", { class: "actions" },
    btn(tl("Retry"), "primary", () => actions.setView(State.defaultView())),
    btn(tl("Open in n8n"), "secondary", () => actions.openUrl("")),
  );
  const el = h("div", { class: "view" }, card("red", stack(116, 16, who, title, detail, row)));
  return {
    el,
    sync() {
      const task = State.focusTask;
      clear(who);
      // agentWho already shows an agent's name: its label is just the kind.
      const whoLabel = task?.source === "n8n" ? "n8n" : task?.source === "agent" ? t("Agent") : "Claude Code";
      who.append(agentWho(task, whoLabel));
      title.textContent = task?.source === "n8n" ? t("Workflow stopped.") : t("Session stopped on an error.");
      detail.textContent = (task && lastTextStep(task.steps)) ?? t("No detail available.");
    },
  };
}

// ── Finished ──────────────────────────────────────────────────────────────────

function buildFinished(actions: ViewActions): ViewHost {
  const who = h("div");
  const title = h("div", { class: "title one-line" });
  const open = btn(tl("Open terminal"), "primary", () => actions.openTerminal());
  const row = h("div", { class: "actions" },
    open,
    btn(tl("OK"), "secondary", () => actions.collapse()),
  );
  const el = h("div", { class: "view" }, card("green", stack(116, 16, who, title, row)));
  return {
    el,
    sync() {
      clear(who);
      const agent = State.focusTask?.source === "agent";
      who.append(agentWho(State.focusTask, agent ? t("finished") : t("Claude Code finished")));
      // The final message, else the last step that is not a diff (FinishedView).
      const task = State.focusTask;
      title.textContent = task?.finalLine || (task && lastTextStep(task.steps)) || t("Session finished");
      // Sessions from the Claude desktop app live there, not in a terminal.
      const label = task?.id === "agent_claude-desktop" ? t("Open Claude") : t("Open terminal");
      const span = open.firstElementChild as HTMLElement;
      if (span.textContent !== label) span.textContent = label;
    },
  };
}

// ── Confused ──────────────────────────────────────────────────────────────────

function buildConfused(): ViewHost {
  const body = h(
    "div",
    { class: "stack", style: "padding:0 18px 0 128px" },
    h("div", { class: "title", text: tl("Too many hits at once.") }),
    h("div", { class: "sub", text: tl("Give me a sec — back to work in three seconds.") }),
  );
  return { el: h("div", { class: "view" }, card("pink", body)), sync() { } };
}

// ── Note ──────────────────────────────────────────────────────────────────────

function buildNote(): ViewHost {
  const title = h("div", { class: "title" });
  const el = h("div", { class: "view" }, card(null, h("div", { class: "stack", style: "padding:0 18px 0 98px" }, title)));
  return {
    el,
    sync() {
      title.textContent = State.noteMessage ?? "";
    },
  };
}

// ── Notch Views (Stages 1-9) ──────────────────────────────────────────────────

function buildFocus(actions: ViewActions): ViewHost {
  let taskPickerOpen = false;

  // Header Elements
  const modeBadge = h("span", { class: "notch-badge purple", text: "25m Work" });
  const pauseCountBadge = h("span", { class: "notch-badge slate", text: "⚡ 0 pauses" });
  const timerTitle = h(
    "div",
    { class: "notch-view-title" },
    svg(ICONS.focus, 15),
    h("span", { text: "Focus Session" }),
    modeBadge,
    pauseCountBadge,
  );

  // Big digital digits
  const digits = h("div", { class: "notch-timer-digits", text: "25:00" });

  // Progress bar
  const progressBar = h("div", { class: "timer-progress-fill" });
  const progressTrack = h("div", { class: "timer-progress-track" }, progressBar);

  // Subtitle / active accumulated time
  const subTimer = h("div", { class: "timer-sub-text", text: "Ready to focus" });

  // Work presets row
  const workPresets = [15, 25, 45, 50];
  const workChips = workPresets.map((mins) => {
    return h("button", {
      class: "preset-chip",
      text: `${mins}m`,
      onclick: () => {
        actions.blip();
        FocusEngine.setWorkDuration(mins);
      },
    });
  });

  const breakPresets = [5, 10, 15];
  const breakChips = breakPresets.map((mins) => {
    return h("button", {
      class: "preset-chip",
      text: `Break ${mins}m`,
      onclick: () => {
        actions.blip();
        FocusEngine.setBreakDuration(mins);
      },
    });
  });

  const presetRow = h("div", { class: "preset-row" }, ...workChips, ...breakChips);

  // Stepper controls for custom minutes
  const workMinusBtn = h("button", {
    class: "stepper-btn",
    text: "−",
    onclick: () => {
      actions.blip();
      FocusEngine.setWorkDuration(FocusEngine.workDurationMinutes - 5);
    },
  });
  const workValSpan = h("span", { class: "stepper-val", text: "25m" });
  const workPlusBtn = h("button", {
    class: "stepper-btn",
    text: "+",
    onclick: () => {
      actions.blip();
      FocusEngine.setWorkDuration(FocusEngine.workDurationMinutes + 5);
    },
  });

  const breakMinusBtn = h("button", {
    class: "stepper-btn",
    text: "−",
    onclick: () => {
      actions.blip();
      FocusEngine.setBreakDuration(FocusEngine.breakDurationMinutes - 1);
    },
  });
  const breakValSpan = h("span", { class: "stepper-val", text: "5m" });
  const breakPlusBtn = h("button", {
    class: "stepper-btn",
    text: "+",
    onclick: () => {
      actions.blip();
      FocusEngine.setBreakDuration(FocusEngine.breakDurationMinutes + 1);
    },
  });

  const steppersRow = h(
    "div",
    { class: "stepper-container" },
    h("div", { class: "stepper-group" }, h("span", { class: "stepper-label", text: "Work" }), workMinusBtn, workValSpan, workPlusBtn),
    h("div", { class: "stepper-group" }, h("span", { class: "stepper-label", text: "Break" }), breakMinusBtn, breakValSpan, breakPlusBtn),
  );

  // Primary action button (Start / Pause / Resume)
  const startBtn = h(
    "button",
    {
      class: "notch-btn primary",
      onclick: () => {
        actions.blip();
        if (State.timerRunning) {
          FocusEngine.pause();
        } else {
          FocusEngine.start();
        }
      },
    },
    h("span", { text: "Start Focus" }),
  );

  // Reset / Stop button
  const resetBtn = h(
    "button",
    {
      class: "notch-btn secondary",
      onclick: () => {
        actions.blip();
        FocusEngine.reset();
      },
    },
    h("span", { text: "Reset" }),
  );

  // Skip break button (visible during break)
  const skipBreakBtn = h(
    "button",
    {
      class: "notch-btn secondary",
      style: "display:none",
      onclick: () => {
        actions.blip();
        FocusEngine.skipBreak();
      },
    },
    h("span", { text: "Skip Break" }),
  );

  const buttonRow = h("div", { class: "btn-row" }, startBtn, resetBtn, skipBreakBtn);

  // Task attachment row + inline dropdown
  const taskTextSpan = h("span", { class: "grow task-title-text" });
  const taskActionHint = h("span", { class: "link-hint", text: "Attach" });
  const detachBtn = h("button", {
    class: "detach-btn",
    title: "Detach task",
    onclick: (e: Event) => {
      e.stopPropagation();
      actions.blip();
      FocusEngine.detachTask();
    },
  }, svg(ICONS.xmark, 10));

  const taskRow = h(
    "button",
    {
      class: "attach-task-row",
      onclick: () => {
        actions.blip();
        taskPickerOpen = !taskPickerOpen;
        renderTaskPicker();
      },
    },
    svg(ICONS.tasks, 12),
    taskTextSpan,
    detachBtn,
    taskActionHint,
  );

  const taskPickerDropdown = h("div", { class: "task-picker-dropdown", style: "display:none" });

  function renderTaskPicker() {
    taskPickerDropdown.style.display = taskPickerOpen ? "flex" : "none";
    if (!taskPickerOpen) return;

    clear(taskPickerDropdown);
    const available = TaskManager.getFilteredTasks("all").filter((t) => !t.done);
    if (available.length === 0) {
      taskPickerDropdown.append(
        h("div", { class: "picker-empty", text: "No pending tasks. Create one in Tasks tab." }),
      );
      return;
    }

    for (const t of available) {
      const isCurrent = State.activeTaskId === t.id;
      const item = h(
        "button",
        {
          class: `picker-item ${isCurrent ? "selected" : ""}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            actions.blip();
            FocusEngine.attachTask(t.id, t.title);
            taskPickerOpen = false;
            taskPickerDropdown.style.display = "none";
          },
        },
        h("span", { class: "picker-title", text: t.title }),
        h("span", { class: `task-priority ${t.priority}`, text: t.priority.toUpperCase() }),
      );
      taskPickerDropdown.append(item);
    }
  }

  // Break Prompt Card (overlay / conditional display)
  const breakPromptCard = h("div", { class: "break-prompt-card", style: "display:none" });
  const breakPromptTitle = h("div", { class: "break-prompt-title", text: "🎉 Focus Session Complete!" });
  const breakPromptSub = h("div", { class: "break-prompt-sub" });
  const startBreakBtn = h(
    "button",
    {
      class: "notch-btn primary",
      onclick: () => {
        actions.blip();
        FocusEngine.startBreak();
      },
    },
    h("span", { text: "☕ Start 5m Break" }),
  );
  const skipToFocusBtn = h(
    "button",
    {
      class: "notch-btn secondary",
      onclick: () => {
        actions.blip();
        FocusEngine.skipBreak();
        FocusEngine.start();
      },
    },
    h("span", { text: "⏭ Start Next Focus" }),
  );
  const dismissPromptBtn = h(
    "button",
    {
      class: "link-btn",
      style: "font-size:11px;color:#94a3b8;margin-left:auto",
      text: "Dismiss",
      onclick: () => {
        actions.blip();
        FocusEngine.dismissBreakPrompt();
      },
    },
  );
  const promptBtnRow = h("div", { class: "btn-row", style: "margin-top:6px" }, startBreakBtn, skipToFocusBtn, dismissPromptBtn);
  breakPromptCard.append(breakPromptTitle, breakPromptSub, promptBtnRow);

  // Normal content container
  const normalContent = h(
    "div",
    { class: "timer-main-container" },
    h("div", { class: "timer-center-stack" },
      digits,
      progressTrack,
      subTimer,
      presetRow,
      steppersRow,
      buttonRow,
    ),
    taskRow,
    taskPickerDropdown,
  );

  const body = h(
    "div",
    { class: "notch-view-body" },
    h("div", { class: "notch-view-header" }, timerTitle),
    breakPromptCard,
    normalContent,
  );

  const el = h("div", { class: "view focus" }, card(null, body));

  return {
    el,
    sync() {
      const mins = Math.floor(State.timerSecondsLeft / 60);
      const secs = State.timerSecondsLeft % 60;
      digits.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

      const total = State.timerTotalSeconds || 25 * 60;
      const pct = Math.max(0, Math.min(100, ((total - State.timerSecondsLeft) / total) * 100));
      progressBar.style.width = `${pct}%`;

      // Mode & badge text
      if (State.timerMode === "work") {
        modeBadge.className = "notch-badge purple";
        modeBadge.textContent = `${FocusEngine.workDurationMinutes}m Work`;
        progressBar.style.background = "linear-gradient(90deg, #a855f7 0%, #ec4899 100%)";
        skipBreakBtn.style.display = "none";
      } else {
        modeBadge.className = "notch-badge green";
        modeBadge.textContent = `${FocusEngine.breakDurationMinutes}m Break`;
        progressBar.style.background = "linear-gradient(90deg, #22c55e 0%, #10b981 100%)";
        skipBreakBtn.style.display = "inline-flex";
      }

      pauseCountBadge.textContent = `⚡ ${State.timerInterruptions} ${State.timerInterruptions === 1 ? "pause" : "pauses"}`;
      pauseCountBadge.style.display = State.timerInterruptions > 0 ? "inline-block" : "none";

      // Stepper values
      workValSpan.textContent = `${FocusEngine.workDurationMinutes}m`;
      breakValSpan.textContent = `${FocusEngine.breakDurationMinutes}m`;

      // Preset highlights
      workChips.forEach((chip, i) => {
        chip.classList.toggle("on", FocusEngine.workDurationMinutes === workPresets[i] && State.timerMode === "work");
      });
      breakChips.forEach((chip, i) => {
        chip.classList.toggle("on", FocusEngine.breakDurationMinutes === breakPresets[i] && State.timerMode === "break");
      });

      // Start/Pause button label
      const startLabel = startBtn.firstElementChild as HTMLElement;
      if (startLabel) {
        if (State.timerRunning) {
          startLabel.textContent = "⏸ Pause";
          startBtn.className = "notch-btn amber";
        } else if (State.timerSecondsLeft < State.timerTotalSeconds) {
          startLabel.textContent = "▶ Resume";
          startBtn.className = "notch-btn primary";
        } else {
          startLabel.textContent = State.timerMode === "work" ? "▶ Start Focus" : "▶ Start Break";
          startBtn.className = "notch-btn primary";
        }
      }

      // Subtitle status
      if (State.timerRunning) {
        const activeMins = Math.floor(FocusEngine.accumulatedActiveSeconds / 60);
        const activeSecs = FocusEngine.accumulatedActiveSeconds % 60;
        subTimer.textContent = `Active: ${activeMins}m ${String(activeSecs).padStart(2, "0")}s · Steady pace`;
      } else if (State.timerSecondsLeft < State.timerTotalSeconds) {
        subTimer.textContent = `Paused at ${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      } else {
        subTimer.textContent = State.timerMode === "work" ? "Ready for deep work" : "Ready to recharge";
      }

      // Task row
      if (State.activeTaskTitle) {
        taskTextSpan.textContent = `Attached: ${State.activeTaskTitle}`;
        taskActionHint.textContent = "Change";
        detachBtn.style.display = "inline-grid";
      } else {
        taskTextSpan.textContent = "No task attached · Click to link from Tasks";
        taskActionHint.textContent = "+ Attach";
        detachBtn.style.display = "none";
      }

      // Break Prompt card display
      if (State.showBreakPrompt) {
        breakPromptCard.style.display = "flex";
        normalContent.style.display = "none";
        breakPromptSub.textContent = `Focused for ${FocusEngine.workDurationMinutes}m with ${FocusEngine.interruptions} pauses. Rest your eyes and stretch.`;
        const startBreakSpan = startBreakBtn.firstElementChild as HTMLElement;
        if (startBreakSpan) startBreakSpan.textContent = `☕ Start ${FocusEngine.breakDurationMinutes}m Break`;
      } else {
        breakPromptCard.style.display = "none";
        normalContent.style.display = "block";
      }
    },
  };
}

function buildTasks(actions: ViewActions): ViewHost {
  let filter: "today" | "upcoming" | "overdue" | "all" | "done" = "today";
  let detailedDrawerOpen = false;
  let editingTaskId: string | null = null;

  const countBadge = h("span", { class: "notch-badge purple", text: "3 active" });
  const overdueBadge = h("span", { class: "notch-badge red", style: "display:none", text: "⚠️ 0 overdue" });
  const title = h("div", { class: "notch-view-title" }, svg(ICONS.tasks, 15), h("span", { text: "Tasks" }), countBadge, overdueBadge);

  const filterToday = h("button", { class: "filter-chip on", text: "Today", onclick: () => setFilter("today") });
  const filterUpcoming = h("button", { class: "filter-chip", text: "Upcoming", onclick: () => setFilter("upcoming") });
  const filterOverdue = h("button", { class: "filter-chip", text: "Overdue", onclick: () => setFilter("overdue") });
  const filterAll = h("button", { class: "filter-chip", text: "All", onclick: () => setFilter("all") });
  const filterDone = h("button", { class: "filter-chip", text: "Done", onclick: () => setFilter("done") });

  const filterButtons = [filterToday, filterUpcoming, filterOverdue, filterAll, filterDone];

  function setFilter(f: typeof filter) {
    actions.blip();
    filter = f;
    filterButtons.forEach((b) => b.classList.remove("on"));
    if (f === "today") filterToday.classList.add("on");
    else if (f === "upcoming") filterUpcoming.classList.add("on");
    else if (f === "overdue") filterOverdue.classList.add("on");
    else if (f === "all") filterAll.classList.add("on");
    else if (f === "done") filterDone.classList.add("on");
    renderList();
  }

  const filters = h("div", { class: "filter-row" }, ...filterButtons);
  const header = h("div", { class: "notch-view-header" }, title, filters);

  // Quick-Add Input + Drawer Toggle
  const quickInput = h("input", {
    class: "task-input",
    placeholder: "+ Add task for today (press Enter or click +)...",
    onfocus: () => {
      actions.keyboard(true);
      actions.holdOpen(true);
    },
    onblur: () => {
      actions.keyboard(false);
      actions.holdOpen(false);
    },
    onkeydown: (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter" && quickInput.value.trim()) {
        actions.blip();
        TaskManager.createTask({
          title: quickInput.value.trim(),
          priority: "med",
          dueDate: new Date().toISOString().slice(0, 10),
          dueTime: "14:00",
        });
        quickInput.value = "";
        renderList();
      }
    },
  }) as HTMLInputElement;

  const toggleDrawerBtn = h(
    "button",
    {
      class: "drawer-toggle-btn",
      title: "Task options (priority, due date, reminders)",
      onclick: () => {
        actions.blip();
        detailedDrawerOpen = !detailedDrawerOpen;
        editingTaskId = null;
        renderDrawer();
      },
    },
    svg(ICONS.plus, 11),
  );

  const inputRow = h("div", { class: "task-input-row" }, quickInput, toggleDrawerBtn);

  // Detailed Drawer (for new task with options or editing existing task)
  const drawerEl = h("div", { class: "task-drawer", style: "display:none" });
  const drawerTitleInput = h("input", { class: "drawer-field", placeholder: "Task title..." }) as HTMLInputElement;
  const drawerDescInput = h("input", { class: "drawer-field", placeholder: "Description or notes (optional)..." }) as HTMLInputElement;

  let selectedPriority: "low" | "med" | "high" = "med";
  const prioLow = h("button", { class: "seg-btn", text: "Low", onclick: () => setPrio("low") });
  const prioMed = h("button", { class: "seg-btn on", text: "Med", onclick: () => setPrio("med") });
  const prioHigh = h("button", { class: "seg-btn", text: "High", onclick: () => setPrio("high") });

  function setPrio(p: "low" | "med" | "high") {
    actions.blip();
    selectedPriority = p;
    prioLow.classList.toggle("on", p === "low");
    prioMed.classList.toggle("on", p === "med");
    prioHigh.classList.toggle("on", p === "high");
  }

  const prioSeg = h("div", { class: "seg-row" }, prioLow, prioMed, prioHigh);

  const dateInput = h("input", { class: "drawer-field date-input", type: "date" }) as HTMLInputElement;
  const timeInput = h("input", { class: "drawer-field time-input", type: "time", value: "12:00" }) as HTMLInputElement;

  let selectedReminder: "none" | "once" | "daily" | "weekdays" = "none";
  const remNone = h("button", { class: "seg-btn on", text: "None", onclick: () => setRem("none") });
  const remOnce = h("button", { class: "seg-btn", text: "Once", onclick: () => setRem("once") });
  const remDaily = h("button", { class: "seg-btn", text: "Daily", onclick: () => setRem("daily") });
  const remWeekdays = h("button", { class: "seg-btn", text: "Weekdays", onclick: () => setRem("weekdays") });

  function setRem(r: typeof selectedReminder) {
    actions.blip();
    selectedReminder = r;
    remNone.classList.toggle("on", r === "none");
    remOnce.classList.toggle("on", r === "once");
    remDaily.classList.toggle("on", r === "daily");
    remWeekdays.classList.toggle("on", r === "weekdays");
  }

  const remSeg = h("div", { class: "seg-row" }, remNone, remOnce, remDaily, remWeekdays);

  const saveDrawerBtn = h(
    "button",
    {
      class: "notch-btn primary",
      onclick: () => {
        const titleText = (drawerTitleInput.value || quickInput.value).trim();
        if (!titleText) return;

        actions.blip();
        if (editingTaskId) {
          TaskManager.updateTask(editingTaskId, {
            title: titleText,
            description: drawerDescInput.value.trim(),
            priority: selectedPriority,
            dueDate: dateInput.value || new Date().toISOString().slice(0, 10),
            dueTime: timeInput.value || "12:00",
            reminderType: selectedReminder,
            reminderTime: timeInput.value || "12:00",
          });
          editingTaskId = null;
        } else {
          TaskManager.createTask({
            title: titleText,
            description: drawerDescInput.value.trim(),
            priority: selectedPriority,
            dueDate: dateInput.value || new Date().toISOString().slice(0, 10),
            dueTime: timeInput.value || "12:00",
            reminderType: selectedReminder,
            reminderTime: timeInput.value || "12:00",
          });
        }

        drawerTitleInput.value = "";
        drawerDescInput.value = "";
        quickInput.value = "";
        detailedDrawerOpen = false;
        renderDrawer();
        renderList();
      },
    },
    h("span", { text: "Save Task" }),
  );

  const cancelDrawerBtn = h(
    "button",
    {
      class: "notch-btn secondary",
      onclick: () => {
        actions.blip();
        detailedDrawerOpen = false;
        editingTaskId = null;
        renderDrawer();
      },
    },
    h("span", { text: "Cancel" }),
  );

  drawerEl.append(
    drawerTitleInput,
    drawerDescInput,
    h("div", { class: "drawer-row" }, h("span", { class: "drawer-label", text: "Priority" }), prioSeg),
    h("div", { class: "drawer-row" }, h("span", { class: "drawer-label", text: "Due Date & Time" }), dateInput, timeInput),
    h("div", { class: "drawer-row" }, h("span", { class: "drawer-label", text: "Reminder" }), remSeg),
    h("div", { class: "btn-row", style: "justify-content:flex-end;margin-top:4px" }, cancelDrawerBtn, saveDrawerBtn),
  );

  function renderDrawer() {
    drawerEl.style.display = detailedDrawerOpen ? "flex" : "none";
    if (detailedDrawerOpen) {
      if (!editingTaskId && quickInput.value.trim()) {
        drawerTitleInput.value = quickInput.value.trim();
      }
      if (!dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
      }
    }
  }

  const listEl = h("div", { class: "task-list-container" });
  const emptyEl = h(
    "div",
    { class: "notch-empty-state" },
    svg(ICONS.check, 24),
    h("div", { class: "empty-title", text: "All caught up" }),
    h("div", { class: "empty-sub", text: "No tasks found for this view." }),
  );

  function renderList() {
    clear(listEl);
    const visible = TaskManager.getFilteredTasks(filter);

    const pendingCount = TaskManager.getPendingCount();
    const overdueCount = TaskManager.getOverdueCount();

    countBadge.textContent = `${pendingCount} pending`;
    if (overdueCount > 0) {
      overdueBadge.style.display = "inline-block";
      overdueBadge.textContent = `⚠️ ${overdueCount} overdue`;
    } else {
      overdueBadge.style.display = "none";
    }

    if (visible.length === 0) {
      const emptyTitle = emptyEl.querySelector(".empty-title") as HTMLElement;
      const emptySub = emptyEl.querySelector(".empty-sub") as HTMLElement;
      if (filter === "overdue") {
        emptyTitle.textContent = "No overdue tasks";
        emptySub.textContent = "You're completely on schedule!";
      } else if (filter === "today") {
        emptyTitle.textContent = "All caught up for today";
        emptySub.textContent = "No pending tasks. Add one above to plan your focus.";
      } else if (filter === "done") {
        emptyTitle.textContent = "No completed tasks yet";
        emptySub.textContent = "Complete tasks to build daily momentum.";
      } else {
        emptyTitle.textContent = "No tasks found";
        emptySub.textContent = "Add a task above to schedule your work.";
      }
      listEl.append(emptyEl);
      return;
    }

    for (const t of visible) {
      const isTaskOverdue = isOverdue(t);

      // Checkbox
      const checkBtn = h(
        "button",
        {
          class: `task-check-circle ${t.done ? "checked" : ""}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            actions.blip();
            TaskManager.toggleTask(t.id);
            renderList();
          },
        },
        t.done ? svg(ICONS.check, 10) : null,
      );

      // Task Title
      const titleSpan = h("span", {
        class: `task-text ${t.done ? "done" : ""}`,
        text: t.title,
      });

      // Status / Due tag
      let dueTag: HTMLElement | null = null;
      if (isTaskOverdue) {
        dueTag = h("span", { class: "task-status-tag overdue", text: `⚠️ Overdue (${t.dueTime || t.dueDate})` });
      } else if (isToday(t)) {
        dueTag = h("span", { class: "task-status-tag today", text: `Today ${t.dueTime}` });
      } else if (t.dueDate) {
        dueTag = h("span", { class: "task-status-tag upcoming", text: `${t.dueDate} ${t.dueTime}` });
      }

      // Reminder Pill
      let remPill: HTMLElement | null = null;
      if (t.reminderType && t.reminderType !== "none") {
        remPill = h("span", { class: "task-rem-pill", text: `🔔 ${t.reminderType}` });
      }

      // Priority Badge
      const priorityBadge = h("span", {
        class: `task-priority ${t.priority}`,
        text: t.priority.toUpperCase(),
      });

      // Set Active / Active button
      const isActive = State.activeTaskId === t.id;
      const activeBtn = h(
        "button",
        {
          class: `task-active-btn ${isActive ? "active" : ""}`,
          text: isActive ? "Active 🎯" : "Set Active",
          onclick: (e: Event) => {
            e.stopPropagation();
            actions.blip();
            FocusEngine.attachTask(t.id, t.title);
            renderList();
          },
        },
      );

      // Edit Button
      const editBtn = h(
        "button",
        {
          class: "task-tool-btn",
          title: "Edit task",
          onclick: (e: Event) => {
            e.stopPropagation();
            actions.blip();
            editingTaskId = t.id;
            detailedDrawerOpen = true;
            drawerTitleInput.value = t.title;
            drawerDescInput.value = t.description || "";
            setPrio(t.priority);
            dateInput.value = t.dueDate;
            timeInput.value = t.dueTime;
            setRem(t.reminderType);
            renderDrawer();
          },
        },
        svg(ICONS.gear, 11),
      );

      // Delete Button
      const deleteBtn = h(
        "button",
        {
          class: "task-tool-btn danger",
          title: "Delete task",
          onclick: (e: Event) => {
            e.stopPropagation();
            actions.blip();
            TaskManager.deleteTask(t.id);
            renderList();
          },
        },
        svg(ICONS.xmark, 11),
      );

      // Main Row
      const mainRow = h(
        "div",
        { class: `notch-task-row ${isTaskOverdue ? "overdue-highlight" : ""}` },
        checkBtn,
        titleSpan,
        dueTag,
        remPill,
        priorityBadge,
        activeBtn,
        editBtn,
        deleteBtn,
      );

      // Description expandable (if present)
      let descRow: HTMLElement | null = null;
      if (t.description) {
        descRow = h("div", { class: "task-desc-row", text: t.description });
      }

      const cardWrapper = h("div", { class: "task-item-card" }, mainRow, descRow);
      listEl.append(cardWrapper);
    }
  }

  const body = h("div", { class: "notch-view-body" }, header, inputRow, drawerEl, listEl);
  const el = h("div", { class: "view tasks" }, card(null, body));

  renderList();

  return {
    el,
    sync() {
      renderList();
    },
  };
}

function buildHabits(actions: ViewActions): ViewHost {
  let filter: "active" | "paused" | "all" = "active";
  let selectedIcon = "🌿";
  let selectedFreq: HabitFrequency = "daily";

  const streakBadge = h("span", { class: "notch-badge purple", text: "🔥 0d streak" });
  const title = h("div", { class: "notch-view-title" }, svg(ICONS.habits, 15), h("span", { text: "Daily Habits" }), streakBadge);

  const filterActive = h("button", { class: "filter-chip on", text: "Active", onclick: () => setFilter("active") });
  const filterPaused = h("button", { class: "filter-chip", text: "Paused", onclick: () => setFilter("paused") });
  const filterAll = h("button", { class: "filter-chip", text: "All", onclick: () => setFilter("all") });
  const filterButtons = [filterActive, filterPaused, filterAll];

  function setFilter(f: typeof filter) {
    actions.blip();
    filter = f;
    filterButtons.forEach((b) => b.classList.remove("on"));
    if (f === "active") filterActive.classList.add("on");
    else if (f === "paused") filterPaused.classList.add("on");
    else if (f === "all") filterAll.classList.add("on");
    renderHabits();
  }

  const filters = h("div", { class: "filter-row" }, ...filterButtons);
  const header = h("div", { class: "notch-view-header" }, title, filters);

  // Quick-Add Input + Options Row
  const quickInput = h("input", {
    class: "task-input",
    placeholder: "+ New habit (e.g. Read 20 mins, Stretch)...",
    onfocus: () => {
      actions.keyboard(true);
      actions.holdOpen(true);
    },
    onblur: () => {
      actions.keyboard(false);
      actions.holdOpen(false);
    },
    onkeydown: (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter") {
        ke.preventDefault();
        commitAdd();
      }
    },
  }) as HTMLInputElement;

  const iconOptions = ["🌿", "🧘", "💧", "📖", "🚶", "☕"];
  const iconChips: HTMLElement[] = [];
  iconOptions.forEach((ic) => {
    const chip = h("button", {
      class: `filter-chip ${ic === selectedIcon ? "on" : ""}`,
      style: "padding: 1px 6px; font-size: 11px;",
      text: ic,
      onclick: () => {
        actions.blip();
        selectedIcon = ic;
        iconChips.forEach((c) => c.classList.remove("on"));
        chip.classList.add("on");
      },
    });
    iconChips.push(chip);
  });

  const freqDaily = h("button", {
    class: "filter-chip on",
    style: "font-size: 10px; padding: 2px 7px;",
    text: "Daily",
    onclick: () => {
      actions.blip();
      selectedFreq = "daily";
      freqDaily.classList.add("on");
      freqWeekdays.classList.remove("on");
    },
  });

  const freqWeekdays = h("button", {
    class: "filter-chip",
    style: "font-size: 10px; padding: 2px 7px;",
    text: "Weekdays",
    onclick: () => {
      actions.blip();
      selectedFreq = "weekdays";
      freqWeekdays.classList.add("on");
      freqDaily.classList.remove("on");
    },
  });

  const addBtn = h("button", {
    class: "btn primary",
    style: "padding: 2px 10px; font-size: 10.5px; height: 24px; min-width: 50px;",
    text: "+ Add",
    onclick: () => commitAdd(),
  });

  function commitAdd() {
    const titleVal = quickInput.value.trim();
    if (!titleVal) return;
    actions.blip();
    HabitManager.createHabit(titleVal, selectedIcon, selectedFreq);
    quickInput.value = "";
    renderHabits();
  }

  const addOptionsRow = h(
    "div",
    { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; gap: 4px; flex-wrap: wrap;" },
    h("div", { style: "display: flex; gap: 4px; align-items: center;" }, ...iconChips),
    h("div", { style: "display: flex; gap: 4px; align-items: center;" }, freqDaily, freqWeekdays, addBtn),
  );

  const addSection = h("div", { class: "habit-add-section", style: "margin-bottom: 4px;" }, quickInput, addOptionsRow);
  const listEl = h("div", { class: "habit-list-container", style: "max-height: 130px; overflow-y: auto;" });

  function renderHabits() {
    const stats = HabitManager.getTotalStats();
    streakBadge.textContent = `🔥 ${stats.maxStreak}d streak · ${stats.completedToday}/${stats.total} done`;

    clear(listEl);
    const habits = HabitManager.getHabits(filter);

    if (habits.length === 0) {
      const emptyNote = h("div", {
        class: "notch-sub-note",
        style: "text-align: center; padding: 12px 0;",
        text: filter === "paused" ? "No paused habits." : "No habits added yet. Type a habit name above and click Add!",
      });
      listEl.append(emptyNote);
      return;
    }

    for (const habit of habits) {
      const isDone = HabitManager.isCompletedToday(habit);
      const streak = HabitManager.calculateCurrentStreak(habit);
      const best = HabitManager.calculateBestStreak(habit);
      const history = HabitManager.getWeeklyHistory(habit);

      const habitIcon = h("span", { style: "font-size: 13px;", text: habit.icon || "🌿" });
      const habitTitle = h("div", { class: "habit-name", text: habit.title });
      const freqTag = h("span", { class: "habit-freq-tag", text: habit.frequency === "weekdays" ? "Weekdays" : "Daily" });
      const habitStreak = h("span", { class: "habit-streak-pill", text: `🔥 ${streak}d` });
      const bestStreak = h("span", { class: "habit-best-pill", text: `⭐ ${best}d` });

      const pauseBtn = h("button", {
        class: "icon-btn-micro",
        title: habit.paused ? "Resume habit" : "Pause habit",
        style: "background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 11px; padding: 2px 4px;",
        text: habit.paused ? "▶️" : "⏸️",
        onclick: (e: Event) => {
          e.stopPropagation();
          actions.blip();
          HabitManager.togglePause(habit.id);
          renderHabits();
        },
      });

      const delBtn = h("button", {
        class: "icon-btn-micro",
        title: "Delete habit",
        style: "background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 11px; padding: 2px 4px;",
        text: "🗑️",
        onclick: (e: Event) => {
          e.stopPropagation();
          actions.blip();
          HabitManager.deleteHabit(habit.id);
          renderHabits();
        },
      });

      const checkBtn = h(
        "button",
        {
          class: `habit-done-btn ${isDone ? "done" : ""}`,
          text: isDone ? "Completed ✓" : "Done today",
          onclick: () => {
            actions.blip();
            HabitManager.toggleToday(habit.id);
            renderHabits();
          },
        },
      );

      const dotsRow = h("div", { class: "habit-dots-row" });
      for (const day of history) {
        let dotClass = "habit-dot";
        if (day.completed) dotClass += " done";
        else if (day.missed) dotClass += " missed";
        else if (!day.scheduled) dotClass += " unscheduled";

        if (day.isToday) dotClass += " today-ring";

        const dotCol = h(
          "div",
          {
            class: "habit-day-col",
            title: `${day.dateStr}: ${day.completed ? "Completed ✓" : day.missed ? "Missed (never auto-completed)" : day.scheduled ? "Today / Pending" : "Rest day"}`,
          },
          h("div", { class: dotClass }),
          h("span", { class: "habit-day-label", text: day.dayLabel }),
        );
        dotsRow.append(dotCol);
      }

      const topRow = h(
        "div",
        { class: "habit-top-row" },
        habitIcon,
        habitTitle,
        freqTag,
        habitStreak,
        bestStreak,
        pauseBtn,
        delBtn,
        checkBtn,
      );

      const cardEl = h(
        "div",
        { class: `notch-habit-card ${habit.paused ? "paused" : ""}` },
        topRow,
        dotsRow,
      );
      listEl.append(cardEl);
    }
  }

  const subNote = h("div", {
    class: "notch-sub-note",
    text: "Daily micro-habits compound into lasting physical and mental wellbeing. Missed days stay visible and are never auto-completed.",
  });

  const body = h("div", { class: "notch-view-body" }, header, addSection, listEl, subNote);
  const el = h("div", { class: "view habits" }, card(null, body));

  HabitManager.addListener(() => {
    renderHabits();
  });

  renderHabits();

  return {
    el,
    sync() {
      renderHabits();
    },
  };
}

function buildWellbeing(actions: ViewActions): ViewHost {
  const statusBadge = h("span", { class: "notch-badge slate", text: "📷 Camera Off" });
  const title = h("div", { class: "notch-view-title" }, svg(ICONS.wellbeing, 15), h("span", { text: "Posture & Wellbeing" }), statusBadge);
  const header = h("div", { class: "notch-view-header" }, title);

  const errorBanner = h("div", { class: "wellbeing-banner", style: "display:none;" });

  const camSwitch = h("button", {
    class: "switch",
    onclick: async () => {
      actions.blip();
      if (State.cameraActive) {
        PostureEngine.stop();
      } else {
        await PostureEngine.start();
      }
      sync();
    },
  });

  const stopBtn = h(
    "button",
    {
      class: "notch-btn secondary stop-cam-btn",
      style: "display:none;",
      onclick: () => {
        actions.blip();
        PostureEngine.stop();
        sync();
      },
    },
    "🔴 Pause / Release Camera",
  );

  const toggleRow = h(
    "div",
    { class: "wellbeing-toggle-card" },
    camSwitch,
    h("div", { class: "toggle-info", style: "flex:1;" },
      h("div", { class: "toggle-title", text: "Enable camera posture analysis" }),
      h("div", { class: "toggle-sub" },
        svg(ICONS.shield, 11),
        h("span", { text: "Processed 100% locally on this device. Nothing is saved or sent." }),
      ),
    ),
    stopBtn,
  );

  // Stage 5 Facial Analysis Toggle (Independent toggle)
  const facialSwitch = h("button", {
    class: `switch ${FatigueEngine.config.enabled ? "on" : ""}`,
    onclick: () => {
      actions.blip();
      FatigueEngine.setEnabled(!FatigueEngine.config.enabled);
      sync();
    },
  });

  const facialToggleRow = h(
    "div",
    { class: "wellbeing-toggle-card", style: "margin-top:6px;" },
    facialSwitch,
    h("div", { class: "toggle-info", style: "flex:1;" },
      h("div", { class: "toggle-title", text: "Facial analysis (Blink & eye rest monitoring)" }),
      h("div", { class: "toggle-sub" },
        svg(ICONS.shield, 11),
        h("span", { text: "Tracks eye closure & PERCLOS independently. Missing signals = no conclusion." }),
      ),
    ),
  );

  // Soft Suggestion Card (Never medical wording, purely suggestion)
  const suggestionText = h("div", { class: "suggestion-text" },
    h("span", { text: "☕ You might be getting tired. Consider a short break." }),
  );

  const takeBreakBtn = h("button", {
    class: "suggestion-btn",
    onclick: () => {
      actions.blip();
      FocusEngine.startBreak();
      State.fatigueSuggestion = null;
      sync();
    },
  }, "Take 5m Break");

  const dismissSuggestionBtn = h("button", {
    class: "suggestion-btn dismiss",
    onclick: () => {
      actions.blip();
      State.fatigueSuggestion = null;
      sync();
    },
  }, "Dismiss");

  const suggestionActions = h("div", { class: "suggestion-actions" }, takeBreakBtn, dismissSuggestionBtn);
  const suggestionCard = h("div", { class: "suggestion-card", style: "display:none;margin-top:6px;" }, suggestionText, suggestionActions);

  // Stage 6 Guided Wellbeing Break Card
  const breakIcon = h("span", { class: "guided-break-icon", text: "👁️" });
  const breakTitle = h("span", { class: "guided-break-title", text: "Break Prompt" });
  const breakTag = h("span", { class: "guided-break-tag", text: "Wellbeing" });
  const breakSummary = h("div", { class: "guided-break-summary", text: "" });
  const breakStepsList = h("div", { class: "guided-break-steps" });
  const breakCountdown = h("div", { class: "guided-break-countdown", text: "20s" });

  const completeBreakBtn = h("button", {
    class: "guided-break-btn complete",
    onclick: () => {
      actions.blip();
      WellbeingBreakManager.completeCurrent();
      sync();
    },
  }, "✓ Complete Break");

  const snoozeBreakBtn = h("button", {
    class: "guided-break-btn snooze",
    onclick: () => {
      actions.blip();
      WellbeingBreakManager.snoozeCurrent(5);
      sync();
    },
  }, "⏱️ Snooze 5m");

  const dismissBreakBtn = h("button", {
    class: "guided-break-btn dismiss",
    onclick: () => {
      actions.blip();
      WellbeingBreakManager.dismissCurrent();
      sync();
    },
  }, "Dismiss");

  const guidedControls = h("div", { class: "guided-break-controls" },
    completeBreakBtn,
    snoozeBreakBtn,
    dismissBreakBtn,
  );

  const guidedTimerBar = h("div", { class: "guided-break-timer-bar" },
    breakCountdown,
    guidedControls,
  );

  const guidedTop = h("div", { class: "guided-break-top" },
    h("div", { class: "guided-break-title-wrap" }, breakIcon, breakTitle, breakTag),
  );

  const guidedBreakCard = h("div", { class: "guided-break-card", style: "display:none;margin-top:6px;" },
    guidedTop,
    breakSummary,
    breakStepsList,
    guidedTimerBar,
  );

  // Live Canvas Preview & Status
  const canvas = document.createElement("canvas");
  canvas.width = 140;
  canvas.height = 95;
  canvas.className = "posture-canvas";
  const ctx = canvas.getContext("2d");

  const liveIndicator = h("div", { class: "cam-live-indicator" },
    h("div", { class: "cam-live-dot" }),
    h("span", { text: "LIVE 5 FPS" }),
  );

  const canvasWrap = h("div", { class: "posture-canvas-wrap" }, canvas, liveIndicator);

  const previewHeading = h("div", { class: "preview-status-heading", text: "Camera Inactive" });
  const previewDesc = h("div", { class: "preview-status-desc", text: "Turn on camera analysis to track posture in real time." });
  const previewInfo = h("div", { class: "posture-preview-info" }, previewHeading, previewDesc);

  const previewContainer = h("div", { class: "posture-preview-container", style: "display:none;" }, canvasWrap, previewInfo);

  // Posture Metrics preview tiles
  const headVal = h("div", { class: "tile-value muted", text: "—" });
  const headTile = h("div", { class: "posture-tile" },
    h("div", { class: "tile-label", text: "Forward Head" }),
    headVal,
  );

  const shoulderVal = h("div", { class: "tile-value muted", text: "—" });
  const shoulderTile = h("div", { class: "posture-tile" },
    h("div", { class: "tile-label", text: "Shoulder Level" }),
    shoulderVal,
  );

  const slouchVal = h("div", { class: "tile-value muted", text: "—" });
  const slouchTile = h("div", { class: "posture-tile" },
    h("div", { class: "tile-label", text: "Spine Posture" }),
    slouchVal,
  );

  const metricsRow = h("div", { class: "posture-metrics-row" }, headTile, shoulderTile, slouchTile);

  // Fatigue / Eye Rest Metrics Tiles
  const eyeClosureVal = h("div", { class: "tile-value muted", text: "—" });
  const eyeClosureTile = h("div", { class: "posture-tile" },
    h("div", { class: "tile-label", text: "Eye Closure Duration" }),
    eyeClosureVal,
  );

  const perclosVal = h("div", { class: "tile-value muted", text: "—" });
  const perclosTile = h("div", { class: "posture-tile" },
    h("div", { class: "tile-label", text: "PERCLOS (60s Window)" }),
    perclosVal,
  );

  const continuousVal = h("div", { class: "tile-value muted", text: "—" });
  const continuousTile = h("div", { class: "posture-tile" },
    h("div", { class: "tile-label", text: "Screen Time" }),
    continuousVal,
  );

  const eyeMetricsRow = h("div", { class: "eye-metrics-row", style: "margin-top:6px;display:none;" },
    eyeClosureTile, perclosTile, continuousTile,
  );

  // Calibration and Settings Card
  const calibrateMsg = h("span", {
    class: "calibrate-status-tag",
    text: State.postureCalibrated ? "✓ Baseline calibrated" : "Uncalibrated (standard baseline)",
  });

  const calibrateBtn = h("button", {
    class: "notch-btn secondary calibrate-btn",
    onclick: () => {
      actions.blip();
      const res = PostureEngine.calibrate();
      calibrateMsg.textContent = res.message;
      sync();
    },
  }, svg(ICONS.camera, 12), h("span", { text: "Calibrate Baseline Posture" }));

  const demoModeSwitch = h("button", {
    class: `switch ${PostureEngine.config.demoMode ? "on" : ""}`,
    onclick: () => {
      actions.blip();
      PostureEngine.setDemoMode(!PostureEngine.config.demoMode);
      sync();
    },
  });

  const demoRow = h("div", { class: "posture-ctrl-row" },
    h("div", { style: "display:flex;flex-direction:column;" },
      h("span", { class: "posture-ctrl-label", text: "⚡ Posture Demo Mode (5s trigger)" }),
      h("span", { class: "posture-ctrl-sub", text: "Triggers warning after 5s bad posture instead of 20s" }),
    ),
    demoModeSwitch,
  );

  const fatigueDemoSwitch = h("button", {
    class: `switch ${FatigueEngine.config.demoMode ? "on" : ""}`,
    onclick: () => {
      actions.blip();
      FatigueEngine.setDemoMode(!FatigueEngine.config.demoMode);
      sync();
    },
  });

  const fatigueDemoRow = h("div", { class: "posture-ctrl-row" },
    h("div", { style: "display:flex;flex-direction:column;" },
      h("span", { class: "posture-ctrl-label", text: "⚡ Fatigue Demo Mode (Fast trigger)" }),
      h("span", { class: "posture-ctrl-sub", text: "Immediate break suggestion on prolonged closure or high PERCLOS" }),
    ),
    fatigueDemoSwitch,
  );

  const sensBtns = (["low", "medium", "high"] as const).map((lvl) =>
    h("button", {
      class: `seg-btn ${PostureEngine.config.sensitivity === lvl ? "on" : ""}`,
      onclick: () => {
        actions.blip();
        PostureEngine.setSensitivity(lvl);
        sync();
      },
    }, lvl.charAt(0).toUpperCase() + lvl.slice(1)),
  );

  const sensRow = h("div", { class: "posture-ctrl-row" },
    h("span", { class: "posture-ctrl-label", text: "Sensitivity" }),
    h("div", { class: "seg-row" }, ...sensBtns),
  );

  const cooldownBtns = [1, 2, 5].map((mins) =>
    h("button", {
      class: `seg-btn ${PostureEngine.config.cooldownMinutes === mins ? "on" : ""}`,
      onclick: () => {
        actions.blip();
        PostureEngine.setCooldown(mins);
        sync();
      },
    }, `${mins}m`),
  );

  const cooldownRow = h("div", { class: "posture-ctrl-row" },
    h("span", { class: "posture-ctrl-label", text: "Warning Cooldown" }),
    h("div", { class: "seg-row" }, ...cooldownBtns),
  );

  const breakIntervalBtns = [20, 30, 45, 60].map((mins) =>
    h("button", {
      class: `seg-btn ${WellbeingBreakManager.intervalMinutes === mins ? "on" : ""}`,
      onclick: () => {
        actions.blip();
        WellbeingBreakManager.setInterval(mins);
        sync();
      },
    }, `${mins}m`),
  );

  const pauseAllBtn = h("button", {
    class: "seg-btn",
    onclick: () => {
      actions.blip();
      if (WellbeingBreakManager.isPaused()) {
        WellbeingBreakManager.resumeAll();
      } else {
        WellbeingBreakManager.pauseAll(1);
      }
      sync();
    },
  }, WellbeingBreakManager.isPaused() ? "Resume Prompts" : "Pause 1h");

  const breakIntervalRow = h("div", { class: "posture-ctrl-row" },
    h("span", { class: "posture-ctrl-label", text: "Break Prompt Interval" }),
    h("div", { style: "display:flex;align-items:center;gap:6px;" },
      h("div", { class: "seg-row" }, ...breakIntervalBtns),
      pauseAllBtn,
    ),
  );

  const ctrlGrid = h("div", { class: "posture-ctrl-grid" },
    demoRow,
    fatigueDemoRow,
    breakIntervalRow,
    sensRow,
    cooldownRow,
  );

  const calibRow = h("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:8px;" },
    calibrateBtn,
    calibrateMsg,
  );

  const quickBreaks = h("div", { class: "quick-breaks-row" },
    h("button", { class: "break-chip", onclick: () => { actions.blip(); WellbeingBreakManager.triggerPrompt("eye-rest"); sync(); } }, "👁️ 20-20-20 Eye Rest"),
    h("button", { class: "break-chip", onclick: () => { actions.blip(); WellbeingBreakManager.triggerPrompt("stretch"); sync(); } }, "🧘 2m Stretch"),
    h("button", { class: "break-chip", onclick: () => { actions.blip(); WellbeingBreakManager.triggerPrompt("posture-reset"); sync(); } }, "🧍 Posture Reset"),
    h("button", { class: "break-chip", onclick: () => { actions.blip(); WellbeingBreakManager.triggerPrompt("water"); sync(); } }, "💧 Water Reminder"),
  );

  const body = h("div", { class: "notch-view-body" },
    header,
    errorBanner,
    toggleRow,
    facialToggleRow,
    suggestionCard,
    guidedBreakCard,
    previewContainer,
    metricsRow,
    eyeMetricsRow,
    calibRow,
    ctrlGrid,
    quickBreaks,
  );

  const el = h("div", { class: "view wellbeing" }, card(null, body));

  function updateMetricsDisplay(m: PostureMetrics | null) {
    if (!m || !State.cameraActive) {
      headVal.className = "tile-value muted";
      headVal.textContent = "—";
      shoulderVal.className = "tile-value muted";
      shoulderVal.textContent = "—";
      slouchVal.className = "tile-value muted";
      slouchVal.textContent = "—";
      previewHeading.textContent = "Camera Off";
      previewDesc.textContent = "Enable camera analysis to monitor spine & shoulder alignment.";
      return;
    }

    if (m.status === "unavailable") {
      headVal.className = "tile-value muted";
      headVal.textContent = "Unavailable";
      shoulderVal.className = "tile-value muted";
      shoulderVal.textContent = "Low Visibility";
      slouchVal.className = "tile-value muted";
      slouchVal.textContent = "Unavailable";
      previewHeading.textContent = "Low Visibility";
      previewDesc.textContent = m.statusText;
      return;
    }

    if (m.isHeadForward) {
      headVal.className = "tile-value attention";
      headVal.textContent = `Forward (${m.forwardHeadRatio.toFixed(2)})`;
    } else {
      headVal.className = "tile-value good";
      headVal.textContent = `Aligned (${m.forwardHeadRatio.toFixed(2)})`;
    }

    if (m.isShoulderTilted) {
      shoulderVal.className = "tile-value attention";
      shoulderVal.textContent = `Tilted (${m.shoulderTiltDeg.toFixed(1)}°)`;
    } else {
      shoulderVal.className = "tile-value good";
      shoulderVal.textContent = `Balanced (${m.shoulderTiltDeg.toFixed(1)}°)`;
    }

    if (m.isSlouching) {
      slouchVal.className = "tile-value attention";
      slouchVal.textContent = `Slouching (${m.slouchRatio.toFixed(2)})`;
    } else {
      slouchVal.className = "tile-value good";
      slouchVal.textContent = `Optimal (${m.slouchRatio.toFixed(2)})`;
    }

    previewHeading.textContent = m.status === "good" ? "Posture: Optimal" : "Posture: Needs Attention";
    previewHeading.style.color = m.status === "good" ? "#86efac" : "#fca5a5";
    previewDesc.textContent = m.statusText;

    const vid = PostureEngine.getVideoElement();
    if (vid && ctx && vid.videoWidth > 0) {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      } catch {
        /* ignore */
      }
    }
  }

  PostureEngine.addListener(updateMetricsDisplay);

  function updateFatigueDisplay(fm: FatigueMetrics | null) {
    if (!fm || !FatigueEngine.config.enabled || !State.cameraActive) {
      eyeClosureVal.className = "tile-value muted";
      eyeClosureVal.textContent = "—";
      perclosVal.className = "tile-value muted";
      perclosVal.textContent = "—";
      continuousVal.className = "tile-value muted";
      continuousVal.textContent = "—";
      suggestionCard.style.display = "none";
      return;
    }

    if (fm.status === "unavailable") {
      eyeClosureVal.className = "tile-value muted";
      eyeClosureVal.textContent = "Unavailable";
      perclosVal.className = "tile-value muted";
      perclosVal.textContent = "Unavailable";
      continuousVal.className = "tile-value muted";
      continuousVal.textContent = `${fm.continuousActiveMinutes}m`;
      suggestionCard.style.display = "none";
      return;
    }

    // Eye closure duration
    if (fm.eyeClosedDurationMs >= 1500) {
      eyeClosureVal.className = "tile-value attention";
      eyeClosureVal.textContent = `Closed (${(fm.eyeClosedDurationMs / 1000).toFixed(1)}s)`;
    } else if (fm.eyesClosed) {
      eyeClosureVal.className = "tile-value warn";
      eyeClosureVal.textContent = `Blink (${(fm.eyeClosedDurationMs / 1000).toFixed(1)}s)`;
    } else {
      eyeClosureVal.className = "tile-value good";
      eyeClosureVal.textContent = "Open (0.0s)";
    }

    // PERCLOS
    const perclosPct = Math.round(fm.perclosRatio * 100);
    if (fm.perclosRatio >= 0.18) {
      perclosVal.className = "tile-value attention";
      perclosVal.textContent = `${perclosPct}% (Elevated)`;
    } else if (fm.perclosRatio >= 0.10) {
      perclosVal.className = "tile-value warn";
      perclosVal.textContent = `${perclosPct}% (Moderate)`;
    } else {
      perclosVal.className = "tile-value good";
      perclosVal.textContent = `${perclosPct}% (Normal)`;
    }

    // Continuous time
    continuousVal.className = "tile-value good";
    continuousVal.textContent = `${fm.continuousActiveMinutes}m active`;

    if (fm.suggestion) {
      suggestionCard.style.display = "flex";
      suggestionText.textContent = `☕ ${fm.suggestion}`;
    } else {
      suggestionCard.style.display = "none";
    }
  }

  FatigueEngine.addListener(updateFatigueDisplay);

  function sync() {
    camSwitch.classList.toggle("on", State.cameraActive);
    stopBtn.style.display = State.cameraActive ? "block" : "none";
    previewContainer.style.display = State.cameraActive ? "flex" : "none";

    const err = PostureEngine.getCameraError();
    if (err) {
      errorBanner.style.display = "flex";
      errorBanner.textContent = `⚠️ ${err}`;
    } else {
      errorBanner.style.display = "none";
    }

    demoModeSwitch.classList.toggle("on", PostureEngine.config.demoMode);
    facialSwitch.classList.toggle("on", FatigueEngine.config.enabled);
    fatigueDemoSwitch.classList.toggle("on", FatigueEngine.config.demoMode);
    eyeMetricsRow.style.display = (State.cameraActive && FatigueEngine.config.enabled) ? "grid" : "none";

    sensBtns.forEach((b, i) =>
      b.classList.toggle("on", PostureEngine.config.sensitivity === (["low", "medium", "high"] as const)[i]),
    );
    cooldownBtns.forEach((b, i) =>
      b.classList.toggle("on", PostureEngine.config.cooldownMinutes === [1, 2, 5][i]),
    );

    clear(statusBadge);
    if (State.cameraActive) {
      if (State.postureStatus === "good") {
        statusBadge.className = "notch-badge green";
        statusBadge.textContent = "🟢 Good Posture";
      } else if (State.postureStatus === "needs-attention") {
        statusBadge.className = "notch-badge red";
        statusBadge.textContent = "⚠️ Needs Attention";
      } else {
        statusBadge.className = "notch-badge slate";
        statusBadge.textContent = "⚪ Low Visibility";
      }
    } else {
      statusBadge.className = "notch-badge slate";
      statusBadge.textContent = "📷 Camera Off";
    }

    updateMetricsDisplay(PostureEngine.getMetrics());
    updateFatigueDisplay(FatigueEngine.getMetrics());

    // Stage 6 Guided Break Card Sync
    if (WellbeingBreakManager.activeBreak) {
      const b = WellbeingBreakManager.activeBreak;
      guidedBreakCard.style.display = "flex";
      breakIcon.textContent = b.def.icon;
      breakTitle.textContent = b.def.title;
      breakTag.textContent = b.def.tag;
      breakSummary.textContent = b.def.summary;
      breakCountdown.textContent = `${b.secondsLeft}s`;
      clear(breakStepsList);
      b.def.instructions.forEach((ins, idx) => {
        breakStepsList.append(
          h("div", { class: "guided-break-step" },
            h("span", { class: "guided-break-step-num", text: `${idx + 1}.` }),
            h("span", { text: ins }),
          ),
        );
      });
    } else {
      guidedBreakCard.style.display = "none";
    }

    breakIntervalBtns.forEach((b, i) =>
      b.classList.toggle("on", WellbeingBreakManager.intervalMinutes === [20, 30, 45, 60][i]),
    );
    pauseAllBtn.textContent = WellbeingBreakManager.isPaused() ? "Resume Prompts" : "Pause 1h";
    pauseAllBtn.classList.toggle("on", WellbeingBreakManager.isPaused());
  }

  WellbeingBreakManager.addListener(sync);

  return {
    el,
    sync,
  };
}

function buildInsights(actions: ViewActions): ViewHost {
  let scope: "today" | "week" = "today";

  const dateStr = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const dateBadge = h("span", { class: "notch-badge purple", text: dateStr });
  const title = h("div", { class: "notch-view-title" }, svg(ICONS.insights, 15), h("span", { text: "Daily Summary & Insights" }), dateBadge);

  const scopeToday = h("button", { class: "filter-chip on", text: "Today", onclick: () => setScope("today") });
  const scopeWeek = h("button", { class: "filter-chip", text: "7 Days", onclick: () => setScope("week") });
  const scopeChips = [scopeToday, scopeWeek];

  function setScope(s: "today" | "week") {
    actions.blip();
    scope = s;
    scopeChips.forEach((b) => b.classList.remove("on"));
    if (s === "today") scopeToday.classList.add("on");
    else scopeWeek.classList.add("on");
    updateScopeVisibility();
  }

  const filters = h("div", { class: "filter-row" }, ...scopeChips);
  const header = h("div", { class: "notch-view-header" }, title, filters);

  // 4 Core Stat Tiles
  const focusValEl = h("div", { class: "stat-val", text: "50 mins" });
  const focusSubEl = h("div", { class: "stat-sub", text: "2 sessions · Measured" });
  const tasksValEl = h("div", { class: "stat-val", text: "2 / 5" });
  const tasksSubEl = h("div", { class: "stat-sub", text: "40% · Measured" });
  const habitsValEl = h("div", { class: "stat-val", text: "2 / 4" });
  const habitsSubEl = h("div", { class: "stat-sub", text: "50% · Measured" });
  const breaksValEl = h("div", { class: "stat-val", text: "3 breaks" });
  const breaksSubEl = h("div", { class: "stat-sub", text: "Good pacing · Estimate" });

  const statTiles = h(
    "div",
    { class: "insights-stats-grid" },
    h(
      "div",
      { class: "stat-tile" },
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
        h("div", { class: "stat-label", text: "Focus Time" }),
        h("span", { class: "stat-badge-tag", text: "Measured" }),
      ),
      focusValEl,
      focusSubEl,
    ),
    h(
      "div",
      { class: "stat-tile" },
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
        h("div", { class: "stat-label", text: "Tasks Done" }),
        h("span", { class: "stat-badge-tag", text: "Measured" }),
      ),
      tasksValEl,
      tasksSubEl,
    ),
    h(
      "div",
      { class: "stat-tile" },
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
        h("div", { class: "stat-label", text: "Habits Done" }),
        h("span", { class: "stat-badge-tag", text: "Measured" }),
      ),
      habitsValEl,
      habitsSubEl,
    ),
    h(
      "div",
      { class: "stat-tile" },
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;" },
        h("div", { class: "stat-label", text: "Breaks" }),
        h("span", { class: "stat-badge-tag estimate", text: "Estimated" }),
      ),
      breaksValEl,
      breaksSubEl,
    ),
  );

  // 7-day Bar Chart Section
  const chartSectionTitle = h(
    "div",
    { class: "insights-section-title" },
    h("span", { text: "Focus Activity (Past 7 Days)" }),
    h("span", { class: "stat-badge-tag", text: "Measured from timer" }),
  );
  const chartContainer = h("div", { class: "insights-chart-container" });
  const chartBox = h("div", { class: "insights-card-box" }, chartSectionTitle, chartContainer);

  // App Usage Breakdown Section (Sample data)
  const appSectionTitle = h(
    "div",
    { class: "insights-section-title" },
    h("span", { text: "Screen & App Usage Breakdown" }),
    h("span", { class: "stat-badge-tag estimate", text: "Sample data · Estimates only" }),
  );

  const sampleApps = [
    { icon: "💻", name: "VS Code / IDE", time: "3h 25m", pct: 44, fill: "linear-gradient(90deg, #a855f7, #c084fc)" },
    { icon: "🌐", name: "Browser & Docs", time: "2h 10m", pct: 28, fill: "linear-gradient(90deg, #ec4899, #f43f5e)" },
    { icon: "💬", name: "Team & Messaging", time: "1h 05m", pct: 14, fill: "linear-gradient(90deg, #38bdf8, #60a5fa)" },
    { icon: "🎵", name: "Audio & Media", time: "45m", pct: 10, fill: "linear-gradient(90deg, #22c55e, #4ade80)" },
    { icon: "⚙️", name: "System & Tools", time: "30m", pct: 4, fill: "linear-gradient(90deg, #94a3b8, #cbd5e1)" },
  ];

  const appRows = sampleApps.map((app) =>
    h(
      "div",
      { class: "app-bar-row" },
      h("div", { class: "app-icon-name" }, h("span", { text: app.icon }), h("span", { text: app.name })),
      h("div", { class: "app-track" }, h("div", { class: "app-fill", style: `width: ${app.pct}%; background: ${app.fill}` })),
      h("div", { class: "app-time", text: app.time }),
      h("div", { class: "app-pct", text: `${app.pct}%` }),
    ),
  );

  const appBox = h("div", { class: "insights-card-box" }, appSectionTitle, ...appRows);

  // Recent Wellbeing Activity Log
  const breaksSectionTitle = h(
    "div",
    { class: "insights-section-title" },
    h("span", { text: "Recent Wellbeing Activity" }),
    h("span", { class: "stat-badge-tag", text: "Recorded logs" }),
  );
  const breakLogsList = h("div", { style: "display:flex;flex-direction:column;gap:4px;" });
  const breaksBox = h("div", { class: "insights-card-box" }, breaksSectionTitle, breakLogsList);

  // Disclaimer Box
  const disclaimerBox = h(
    "div",
    { class: "disclaimer-box" },
    h("span", { class: "disclaimer", text: "Descriptive insights, not a measure of productivity." }),
    h("span", { style: "color:#64748b;font-size:8.5px;", text: "100% offline · Local storage only" }),
  );

  const scrollBody = h("div", { class: "insights-scroll-body" }, statTiles, chartBox, appBox, breaksBox);
  const body = h("div", { class: "notch-view-body" }, header, scrollBody, disclaimerBox);
  const el = h("div", { class: "view insights" }, card(null, body));

  function updateScopeVisibility() {
    if (scope === "today") {
      chartBox.style.display = "flex";
      appBox.style.display = "flex";
      breaksBox.style.display = "flex";
    } else {
      chartBox.style.display = "flex";
      appBox.style.display = "flex";
      breaksBox.style.display = "none";
    }
  }

  function renderChart(todayMins: number) {
    clear(chartContainer);
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const seededMins = [45, 60, 50, 75, 40, 65];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const isToday = i === 0;
      const dayName = isToday ? "Today" : dayLabels[d.getDay()];
      const min = isToday ? todayMins : seededMins[6 - i] ?? 45;
      const pct = Math.min(100, Math.max(10, Math.round((min / 90) * 100)));

      const bar = h("div", {
        class: `chart-bar ${isToday ? "today" : ""}`,
        style: `height: ${pct}%`,
      });

      const col = h(
        "div",
        {
          class: "chart-col",
          title: `${dayName} (${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}): ${min}m focus (${isToday ? "Today · Live measured" : "Measured"})`,
        },
        bar,
        h("span", { class: "chart-day", text: dayName }),
      );
      chartContainer.append(col);
    }
  }

  function sync() {
    const workLogs = FocusEngine.logs.filter((l) => l.mode === "work");
    const addedMins = workLogs.reduce((acc, l) => acc + Math.round(l.durationSeconds / 60), 0);
    const currentOngoingMins = FocusEngine.mode === "work" && FocusEngine.running
      ? Math.round(FocusEngine.accumulatedActiveSeconds / 60)
      : 0;
    const totalFocusMins = 50 + addedMins + currentOngoingMins;
    const totalSessions = 2 + workLogs.length + (FocusEngine.mode === "work" && FocusEngine.running ? 1 : 0);

    focusValEl.textContent = `${totalFocusMins} mins`;
    focusSubEl.textContent = `${totalSessions} sessions · Measured`;

    const allTasks = TaskManager.tasks;
    const doneTasks = allTasks.filter((t) => t.done).length;
    const tasksPct = allTasks.length > 0 ? Math.round((doneTasks / allTasks.length) * 100) : 0;
    tasksValEl.textContent = `${doneTasks} / ${allTasks.length}`;
    tasksSubEl.textContent = `${tasksPct}% complete · Measured`;

    const habitStats = HabitManager.getTotalStats();
    const habitPct = habitStats.total > 0 ? Math.round((habitStats.completedToday / habitStats.total) * 100) : 0;
    habitsValEl.textContent = `${habitStats.completedToday} / ${habitStats.total}`;
    habitsSubEl.textContent = `${habitPct}% consistency · 🔥 ${habitStats.maxStreak}d`;

    const breakLogs = FocusEngine.logs.filter((l) => l.mode === "break");
    const guidedCompleted = WellbeingBreakManager.logs.filter((l) => l.action === "completed").length;
    const totalBreaks = 3 + breakLogs.length + guidedCompleted;
    breaksValEl.textContent = `${totalBreaks} breaks`;

    renderChart(totalFocusMins);

    // Render recent break logs
    clear(breakLogsList);
    const allLogs = WellbeingBreakManager.logs.slice(0, 5);
    if (allLogs.length === 0) {
      breakLogsList.append(
        h("div", { class: "break-log-item", style: "color:#64748b;font-size:10px;padding:4px 0;" }, "No break prompts recorded yet today."),
      );
    } else {
      allLogs.forEach((l) => {
        const time = new Date(l.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const def = BREAK_DEFINITIONS[l.type] ?? { icon: "☕" };
        const badgeClass = l.action === "completed" ? "green" : l.action === "snoozed" ? "amber" : "slate";
        breakLogsList.append(
          h("div", { class: "break-log-item" },
            h("span", { style: "display:flex;align-items:center;gap:6px;" },
              h("span", { text: def.icon }),
              h("span", { text: l.title }),
            ),
            h("div", { style: "display:flex;align-items:center;gap:6px;" },
              h("span", { class: `notch-badge ${badgeClass}`, text: l.action }),
              h("span", { style: "color:#64748b;font-size:9.5px;", text: time }),
            ),
          ),
        );
      });
    }
  }

  sync();

  return {
    el,
    sync,
  };
}

function buildSettings(actions: ViewActions): ViewHost {
  const title = h("div", { class: "notch-view-title" }, svg(ICONS.gear, 15), h("span", { text: "Settings & Privacy" }));
  const header = h("div", { class: "notch-view-header" }, title);

  // 1. System & Window
  const autostartSwitch = h("button", {
    class: "switch",
    onclick: () => {
      actions.blip();
      NotchSettings.setLaunchAtSignIn(!NotchSettings.data.launchAtSignIn);
      sync();
    },
  });

  const animSwitch = h("button", {
    class: "switch",
    onclick: () => {
      actions.blip();
      NotchSettings.setAnimations(!NotchSettings.data.animations);
      sync();
    },
  });

  const hoverSwitch = h("button", {
    class: "switch",
    onclick: () => {
      actions.blip();
      State.settings.openOnHover = !State.settings.openOnHover;
      State.notify();
      sync();
    },
  });

  const segButtons = [2, 5, 10, 15].map((s) =>
    h(
      "button",
      {
        class: "seg-btn",
        onclick: () => {
          actions.blip();
          actions.setAutoClose(s);
          NotchSettings.setCollapseDelay(s);
          sync();
        },
      },
      `${s}s`,
    ),
  );

  const hoverSensBtns = (["low", "normal", "high"] as const).map((lvl) =>
    h(
      "button",
      {
        class: "seg-btn",
        onclick: () => {
          actions.blip();
          NotchSettings.setHoverSensitivity(lvl);
          sync();
        },
      },
      lvl.charAt(0).toUpperCase() + lvl.slice(1),
    ),
  );

  const soundSwitch = h("button", { class: "switch", onclick: () => actions.toggleSound() });
  const volume = h("input", {
    type: "range",
    min: "0",
    max: "0.2",
    step: "0.005",
    oninput: (e: Event) => actions.setVolume(Number((e.target as HTMLInputElement).value)),
  }) as HTMLInputElement;

  const systemCard = h(
    "div",
    { class: "settings-card" },
    h("div", { class: "settings-card-title", text: "System & Window" }),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "Launch at Sign-in" }),
        h("div", { class: "settings-item-desc", text: "Start Notch Companion automatically on Windows boot" }),
      ),
      autostartSwitch,
    ),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "Collapse Delay" }),
        h("div", { class: "settings-item-desc", text: "How long panel remains open before auto-closing" }),
      ),
      h("div", { class: "seg-row" }, ...segButtons),
    ),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "Hover Zone Sensitivity" }),
        h("div", { class: "settings-item-desc", text: "Top-of-screen cursor wake sensitivity" }),
      ),
      h("div", { class: "seg-row" }, ...hoverSensBtns),
    ),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "Open Panel on Hover" }),
        h("div", { class: "settings-item-desc", text: "Expand island directly on cursor hover" }),
      ),
      hoverSwitch,
    ),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "UI Animations" }),
        h("div", { class: "settings-item-desc", text: "Smooth sliding and morphing effects" }),
      ),
      animSwitch,
    ),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "Sound Effects & Volume" }),
        h("div", { class: "settings-item-desc", text: "Audio blips for completions and timers" }),
      ),
      h("div", { style: "display:flex;align-items:center;gap:6px;" }, soundSwitch, volume),
    ),
  );

  // 2. Posture & Vision
  const camSwitch = h("button", {
    class: "switch",
    onclick: () => {
      actions.blip();
      NotchSettings.setCameraAnalysis(!State.cameraActive);
      sync();
    },
  });

  const facialSwitch = h("button", {
    class: "switch",
    onclick: () => {
      actions.blip();
      NotchSettings.setFacialAnalysis(!FatigueEngine.config.enabled);
      sync();
    },
  });

  const demoSwitch = h("button", {
    class: "switch",
    onclick: () => {
      actions.blip();
      NotchSettings.setDemoMode(!NotchSettings.data.demoMode);
      sync();
    },
  });

  const notifFreqBtns = (["low", "normal", "frequent"] as const).map((lvl) =>
    h(
      "button",
      {
        class: "seg-btn",
        onclick: () => {
          actions.blip();
          NotchSettings.setNotificationFrequency(lvl);
          sync();
        },
      },
      lvl.charAt(0).toUpperCase() + lvl.slice(1),
    ),
  );

  const visionCard = h(
    "div",
    { class: "settings-card" },
    h("div", { class: "settings-card-title", text: "Posture & Vision Analysis" }),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "Camera Posture Analysis" }),
        h("div", { class: "settings-item-desc", text: "Detect slouching and forward head tilt on-device" }),
      ),
      camSwitch,
    ),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "Facial Fatigue Analysis" }),
        h("div", { class: "settings-item-desc", text: "Evaluate eye blink rate and PERCLOS closure time" }),
      ),
      facialSwitch,
    ),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "Notification Frequency" }),
        h("div", { class: "settings-item-desc", text: "Minimum interval between posture warnings" }),
      ),
      h("div", { class: "seg-row" }, ...notifFreqBtns),
    ),
    h(
      "div",
      { class: "settings-item" },
      h("div", { class: "settings-item-info" },
        h("div", { class: "settings-item-title", text: "Presentation Demo Mode" }),
        h("div", { class: "settings-item-desc", text: "Triggers posture warnings in 5s (instead of 20s)" }),
      ),
      demoSwitch,
    ),
  );

  // 3. Privacy, Data & Reset
  const trackingSwitch = h("button", {
    class: "switch",
    onclick: () => {
      actions.blip();
      NotchSettings.setUsageTracking(!NotchSettings.data.usageTracking);
      sync();
    },
  });

  const deleteBtn = h("button", {
    class: "danger-btn",
    text: "Delete All My Data",
    onclick: () => {
      actions.blip();
      deleteConfirmBox.style.display = "flex";
      deleteBtn.style.display = "none";
    },
  });

  const deleteConfirmBox = h(
    "div",
    { class: "delete-confirm-box", style: "display:none;" },
    h("div", { style: "font-size:10px;color:#fca5a5;font-weight:600;", text: "⚠️ Permanently erase all tasks, habits, focus logs, and calibration?" }),
    h(
      "div",
      { style: "display:flex;gap:6px;justify-content:flex-end;" },
      h(
        "button",
        {
          class: "btn secondary",
          style: "padding:2px 8px;font-size:10px;height:22px;",
          text: "Cancel",
          onclick: () => {
            actions.blip();
            deleteConfirmBox.style.display = "none";
            deleteBtn.style.display = "block";
          },
        },
      ),
      h(
        "button",
        {
          class: "danger-btn",
          style: "padding:2px 8px;font-size:10px;height:22px;",
          text: "Yes, Erase Everything",
          onclick: () => {
            actions.blip();
            NotchSettings.deleteAllData();
            deleteConfirmBox.style.display = "none";
            deleteBtn.style.display = "block";
            sync();
          },
        },
      ),
    ),
  );

  const privacyBox = h(
    "div",
    { class: "privacy-statement-box" },
    h("div", { style: "font-size:10px;font-weight:600;color:#c084fc;", text: "Privacy Guarantee" }),
    h("div", { class: "privacy-item" }, h("span", { text: "🔒" }), h("span", { text: "100% Offline: Zero telemetry, zero external network requests." })),
    h("div", { class: "privacy-item" }, h("span", { text: "💾" }), h("span", { text: "Local Storage Only: All tasks, habits, and timers stay strictly on this device." })),
    h("div", { class: "privacy-item" }, h("span", { text: "📷" }), h("span", { text: "No Video Saved: Webcams process landmark coordinates locally in WASM memory on-device; video frames are discarded immediately frame-by-frame and never stored to disk or transmitted." })),
    h("div", { class: "privacy-item" }, h("span", { text: "⌨️" }), h("span", { text: "No Keystrokes or Screenshots: Notch Companion never monitors, logs, or intercepts keystrokes, clipboard, or screen contents." })),
  );

    const demoResetBtn = h("button", {
      class: "btn secondary",
      style: "padding: 3px 10px; font-size: 10px; height: 24px;",
      text: "✨ Restore Demo Data",
      title: "Restore clean demo tasks and habits (Ctrl+Shift+R)",
      onclick: () => {
        actions.blip();
        TaskManager.resetToSeed();
        HabitManager.resetDemoData();
        PostureEngine.setDemoMode(true);
        Sound.play("finish");
        sync();
      },
    });

    const privacyCard = h(
      "div",
      { class: "settings-card" },
      h("div", { class: "settings-card-title", text: "Privacy & Data" }),
      h(
        "div",
        { class: "settings-item" },
        h("div", { class: "settings-item-info" },
          h("div", { class: "settings-item-title", text: "Local Usage Tracking" }),
          h("div", { class: "settings-item-desc", text: "Aggregate focus and break statistics into Insights" }),
        ),
        trackingSwitch,
      ),
      privacyBox,
      h(
        "div",
        { style: "margin-top:6px;display:flex;justify-content:space-between;align-items:center;" },
        h("span", { class: "setting-label dim", text: "Demo presentation reset:" }),
        demoResetBtn,
      ),
      h(
        "div",
        { style: "margin-top:4px;display:flex;justify-content:space-between;align-items:center;" },
        h("span", { class: "setting-label dim", text: "Erase all local storage:" }),
        deleteBtn,
      ),
      deleteConfirmBox,
    );

  const versionFooter = h(
    "div",
    { style: "text-align:center;font-size:9.5px;color:#64748b;padding:4px 0;" },
    "Notch Companion v1.0.4 · 100% Offline Desktop Companion · Based on Coucou (MIT License)",
  );

  const scrollBody = h("div", { class: "settings-scroll-body" }, systemCard, visionCard, privacyCard, versionFooter);
  const body = h("div", { class: "notch-view-body" }, header, scrollBody);
  const el = h("div", { class: "view settings" }, card(null, body));

  function sync() {
    const s = State.settings;
    const ns = NotchSettings.data;

    autostartSwitch.classList.toggle("on", s.autostart || ns.launchAtSignIn);
    animSwitch.classList.toggle("on", ns.animations);
    hoverSwitch.classList.toggle("on", s.openOnHover);
    soundSwitch.classList.toggle("on", s.soundEnabled);
    volume.value = String(s.soundVolume);
    volume.style.opacity = s.soundEnabled ? "1" : "0.4";

    segButtons.forEach((b, i) => b.classList.toggle("on", Math.round(s.autoCloseInterval) === [2, 5, 10, 15][i]));
    hoverSensBtns.forEach((b, i) => b.classList.toggle("on", ns.hoverSensitivity === (["low", "normal", "high"] as const)[i]));

    camSwitch.classList.toggle("on", State.cameraActive);
    facialSwitch.classList.toggle("on", FatigueEngine.config.enabled);
    demoSwitch.classList.toggle("on", ns.demoMode || PostureEngine.config.demoMode);
    notifFreqBtns.forEach((b, i) => b.classList.toggle("on", ns.notificationFrequency === (["low", "normal", "frequent"] as const)[i]));

    trackingSwitch.classList.toggle("on", ns.usageTracking);
  }

  NotchSettings.addListener(() => {
    sync();
  });

  sync();

  return {
    el,
    sync,
  };
}

// ── Placeholders filled in later stages ───────────────────────────────────────

function buildPlaceholder(title: Msg, sub: string): ViewHost {
  const body = h(
    "div",
    { class: "stack", style: "padding:0 18px 0 118px" },
    h("div", { class: "title", text: title }),
    h("div", { class: "sub", text: sub }),
  );
  return { el: h("div", { class: "view" }, card(null, body)), sync() { } };
}

// ── Registry ──────────────────────────────────────────────────────────────────

export function buildViews(
  actions: ViewActions,
  onChatHeightChange: () => void,
): Map<IslandViewName, ViewHost> {
  const map = new Map<IslandViewName, ViewHost>();
  map.set("focus", buildFocus(actions));
  map.set("tasks", buildTasks(actions));
  map.set("habits", buildHabits(actions));
  map.set("wellbeing", buildWellbeing(actions));
  map.set("insights", buildInsights(actions));
  map.set("settings", buildSettings(actions));
  map.set("overview", buildOverview(actions));
  map.set("empty", buildEmpty(actions));
  map.set("approval", buildApproval(actions));
  map.set("question", buildQuestion(actions));
  map.set("error", buildError(actions));
  map.set("finished", buildFinished(actions));
  map.set("confused", buildConfused());
  map.set("note", buildNote());
  map.set("prompt", buildPrompt(onChatHeightChange));
  map.set("upload", buildUpload());
  map.set("uploading", buildUploading());
  map.set("choose", buildChoose(actions));
  map.set("recap", buildRecap(actions));
  map.set("wardrobe", buildWardrobe(actions));
  map.set("update", buildUpdate());
  map.set("whatsNew", buildWhatsNew());
  map.set("mail", buildPlaceholder(tl("Sending by email isn't in this version."), ""));
  map.set("searching", buildPlaceholder(tl("Searching…"), ""));
  map.set("result", buildPlaceholder(tl("Result"), ""));
  return map;
}
