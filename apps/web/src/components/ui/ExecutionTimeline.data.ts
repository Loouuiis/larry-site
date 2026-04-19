export type LaneId = "alpha" | "q3" | "platform";

export interface Lane {
  id: LaneId;
  label: string;
}

export const LANES: Lane[] = [
  { id: "alpha", label: "ALPHA LAUNCH" },
  { id: "q3", label: "Q3 PROGRAMME" },
  { id: "platform", label: "PLATFORM MIGRATION" },
];

export type BarState = "in-progress" | "complete" | "overdue" | "escalated";

export interface TaskBar {
  id: string;
  lane: LaneId;
  /** Left edge as a percentage of the lane width */
  left: number;
  /** Target width as a percentage of the lane width (animates 0 → this) */
  width: number;
  /** When the bar first appears (seconds into the 12s loop) */
  tAppear: number;
  /** How long the width animates from 0 to its target */
  tGrow: number;
  /** Initial state; optionally transitions via `transitions[]` */
  state: BarState;
  transitions?: Array<{ at: number; to: BarState }>;
}

export const BARS: TaskBar[] = [
  {
    id: "alpha-deliverables",
    lane: "alpha",
    left: 20, width: 35, tAppear: 0, tGrow: 2,
    state: "in-progress",
    transitions: [{ at: 3, to: "complete" }],
  },
  {
    id: "alpha-stakeholder",
    lane: "alpha",
    left: 60, width: 30, tAppear: 9, tGrow: 2,
    state: "in-progress",
  },
  {
    id: "q3-engsignoff",
    lane: "q3",
    left: 10, width: 25, tAppear: 1, tGrow: 2.5,
    state: "in-progress",
    transitions: [{ at: 6, to: "complete" }],
  },
  {
    id: "platform-apihandoff",
    lane: "platform",
    left: 5, width: 15, tAppear: 4, tGrow: 1.5,
    state: "overdue",
    transitions: [{ at: 7, to: "escalated" }],
  },
];

export interface Notification {
  id: string;
  text: string;
  dot: "brand" | "amber" | "red";
  tShow: number;
  tHide: number;
}

export const NOTIFICATIONS: Notification[] = [
  { id: "n1", text: "Reminder sent → @Morgan", dot: "brand", tShow: 2, tHide: 3.5 },
  { id: "n2", text: "Risk flagged: API handoff 2d overdue", dot: "red", tShow: 4.5, tHide: 6 },
  { id: "n3", text: "Exec summary compiled — ready for review", dot: "brand", tShow: 8, tHide: 9.5 },
];

export const LOOP_SECONDS = 12;
