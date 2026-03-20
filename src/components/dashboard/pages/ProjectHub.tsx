"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
  LayoutDashboard,
  GanttChartSquare,
  CheckSquare,
  AlertTriangle,
  DollarSign,
  Video,
  Flag,
  ChevronDown,
} from "lucide-react";
import { GanttPage } from "./GanttPage";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Tab definitions ───────────────────────────────────────────────────── */

type TabId = "overview" | "timeline" | "tasks" | "risks" | "costs" | "meetings" | "milestones";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: "overview",   label: "Overview",    icon: LayoutDashboard   },
  { id: "timeline",   label: "Timeline",    icon: GanttChartSquare  },
  { id: "tasks",      label: "Tasks",       icon: CheckSquare       },
  { id: "risks",      label: "Risks",       icon: AlertTriangle     },
  { id: "costs",      label: "Costs",       icon: DollarSign        },
  { id: "meetings",   label: "Meetings",    icon: Video             },
  { id: "milestones", label: "Milestones",  icon: Flag              },
];

/* ─── Data types ────────────────────────────────────────────────────────── */

interface Phase {
  label: string;
  pct: number;
  status: "done" | "active" | "upcoming";
}

interface HubTask {
  owner: string;
  task: string;
  due: string;
  status: "pending" | "done" | "overdue";
}

interface Risk {
  id: string;
  title: string;
  impact: "high" | "medium" | "low";
  likelihood: "high" | "medium" | "low";
  owner: string;
  status: "open" | "mitigated" | "closed";
  mitigation: string;
}

interface BudgetCategory {
  name: string;
  budget: number;
  spent: number;
}

interface LineItem {
  category: string;
  description: string;
  budget: number;
  spent: number;
}

interface MeetingAction {
  text: string;
  owner: string;
  status: "pending" | "done";
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  attendees: string[];
  summary: string;
  actions: MeetingAction[];
}

interface Milestone {
  label: string;
  date: string;
  daysFromToday: number;
  status: "done" | "upcoming" | "overdue";
}

interface HubData {
  deadline: string;
  deadlineDays: number;
  progress: number;
  openActions: number;
  team: string[];
  owner: string;
  larryNote: string;
  flaggedRisks: string[];
  phases: Phase[];
  tasks: HubTask[];
  risks: Risk[];
  budget: {
    total: number;
    spent: number;
    forecast: number;
    categories: BudgetCategory[];
    lineItems: LineItem[];
  };
  meetings: Meeting[];
  milestones: Milestone[];
}

/* ─── Mock data ─────────────────────────────────────────────────────────── */

const HUB_DATA: Record<string, HubData> = {
  alpha: {
    deadline: "Apr 5",
    deadlineDays: 16,
    progress: 72,
    openActions: 4,
    team: ["SR", "TK", "ME", "LP"],
    owner: "SR",
    larryNote: "Build phase is 68% through but the API spec sign-off is still outstanding — this is the single biggest risk to the Apr 5 deadline. Finance budget approval is also pending which may delay contractor hiring for UAT.",
    flaggedRisks: [
      "API sign-off delay blocks sprint start and threatens Apr 5 go-live",
      "Finance budget approval outstanding — may delay contractor resource",
    ],
    phases: [
      { label: "Discovery",    pct: 100, status: "done"     },
      { label: "Architecture", pct: 100, status: "done"     },
      { label: "Build",        pct: 68,  status: "active"   },
      { label: "UAT",          pct: 0,   status: "upcoming" },
      { label: "Launch",       pct: 0,   status: "upcoming" },
    ],
    tasks: [
      { owner: "TK", task: "Complete API spec sign-off",             due: "Today",   status: "overdue" },
      { owner: "JP", task: "Submit budget for Finance approval",      due: "Mar 24",  status: "pending" },
      { owner: "ME", task: "Kick off sprint planning after sign-off", due: "Mar 25",  status: "pending" },
      { owner: "SR", task: "Client UAT environment provisioned",      due: "Mar 28",  status: "done"    },
      { owner: "TK", task: "Integration endpoint scaffolding",        due: "Apr 2",   status: "pending" },
      { owner: "ME", task: "Frontend component library review",       due: "Mar 26",  status: "pending" },
    ],
    risks: [
      {
        id: "r1", title: "API spec sign-off delay", impact: "high", likelihood: "high",
        owner: "TK", status: "open",
        mitigation: "Daily chase cadence with TK. Escalate to SR if not resolved by EOD Mar 21. Fallback: agree interim spec freeze to unblock sprint.",
      },
      {
        id: "r2", title: "Finance budget approval", impact: "medium", likelihood: "medium",
        owner: "JP", status: "open",
        mitigation: "JP to submit formal request by Mar 24. SR to flag urgency to Finance Director if not actioned within 48h.",
      },
      {
        id: "r3", title: "UAT environment not ready", impact: "high", likelihood: "low",
        owner: "ME", status: "mitigated",
        mitigation: "UAT environment provisioned Mar 20. Smoke tests passed. No further risk at this stage.",
      },
      {
        id: "r4", title: "Third-party integration delays", impact: "medium", likelihood: "low",
        owner: "TK", status: "closed",
        mitigation: "Integration contracts signed. Vendor confirmed Mar 15 delivery. Closed.",
      },
    ],
    budget: {
      total: 120000,
      spent: 78400,
      forecast: 116200,
      categories: [
        { name: "People",         budget: 70000, spent: 51000 },
        { name: "Infrastructure", budget: 18000, spent: 12400 },
        { name: "Tools",          budget: 8000,  spent: 6200  },
        { name: "External",       budget: 16000, spent: 8800  },
        { name: "Contingency",    budget: 8000,  spent: 0     },
      ],
      lineItems: [
        { category: "People",         description: "Senior developer (TK) — 8 weeks",      budget: 32000, spent: 24000 },
        { category: "People",         description: "Frontend lead (ME) — 6 weeks",          budget: 22000, spent: 16000 },
        { category: "People",         description: "PM (SR) — throughout",                  budget: 16000, spent: 11000 },
        { category: "Infrastructure", description: "AWS hosting & compute",                  budget: 12000, spent: 8200  },
        { category: "Infrastructure", description: "CDN & edge config",                      budget: 6000,  spent: 4200  },
        { category: "Tools",          description: "Datadog monitoring",                     budget: 4000,  spent: 3100  },
        { category: "Tools",          description: "CI/CD tooling",                          budget: 4000,  spent: 3100  },
        { category: "External",       description: "UX design agency",                       budget: 10000, spent: 7200  },
        { category: "External",       description: "Legal / contract review",                budget: 6000,  spent: 1600  },
      ],
    },
    meetings: [
      {
        id: "m1", title: "Sprint 4 Planning", date: "Mar 17",
        attendees: ["SR", "TK", "ME"],
        summary: "Team agreed sprint 4 goals contingent on API spec sign-off. TK committed to resolving outstanding spec items by Mar 20. ME outlined frontend story backlog and highlighted two dependencies on API contracts that need unblocking before implementation can proceed.",
        actions: [
          { text: "TK to finalise API spec by Mar 20",              owner: "TK", status: "pending" },
          { text: "ME to document frontend dependency blockers",     owner: "ME", status: "done"    },
          { text: "SR to schedule client UAT kick-off for Mar 28",  owner: "SR", status: "done"    },
        ],
      },
      {
        id: "m2", title: "Client Progress Review", date: "Mar 10",
        attendees: ["SR", "Client"],
        summary: "Client expressed satisfaction with build progress and confirmed UAT participants. Discussed potential scope addition around reporting module — SR agreed to raise a change request. Timeline risk acknowledged by client; they confirmed flexibility of 2–3 days if needed.",
        actions: [
          { text: "SR to draft change request for reporting module", owner: "SR", status: "pending" },
          { text: "Client to confirm UAT team names by Mar 17",      owner: "Client", status: "done" },
        ],
      },
      {
        id: "m3", title: "Architecture Review", date: "Mar 3",
        attendees: ["TK", "ME", "LP"],
        summary: "Tech stack decisions finalised. LP reviewed security architecture and approved the OAuth2 flow with minor recommendations around token expiry. Database schema design signed off pending one change to the audit log table structure.",
        actions: [
          { text: "TK to update audit log schema",   owner: "TK", status: "done" },
          { text: "LP to document security sign-off", owner: "LP", status: "done" },
        ],
      },
    ],
    milestones: [
      { label: "Discovery complete",    date: "Mar 1",  daysFromToday: -19, status: "done"     },
      { label: "Architecture sign-off", date: "Mar 8",  daysFromToday: -12, status: "done"     },
      { label: "API spec sign-off",     date: "Mar 20", daysFromToday: 0,   status: "overdue"  },
      { label: "Build phase complete",  date: "Mar 31", daysFromToday: 11,  status: "upcoming" },
      { label: "UAT start",             date: "Apr 1",  daysFromToday: 12,  status: "upcoming" },
      { label: "Client sign-off",       date: "Apr 3",  daysFromToday: 14,  status: "upcoming" },
      { label: "Go-live",               date: "Apr 5",  daysFromToday: 16,  status: "upcoming" },
    ],
  },

  q3: {
    deadline: "Mar 28",
    deadlineDays: 8,
    progress: 45,
    openActions: 9,
    team: ["LP", "SR", "AK", "ME"],
    owner: "LP",
    larryNote: "Three workstreams running in parallel with no buffer remaining. Client deliverables are stalled — 3 items overdue with no owner response. Deadline is 8 days away and workstream 2 is the critical path risk.",
    flaggedRisks: [
      "Mar 28 deadline at risk if client sign-off not received by Mar 22",
      "Workstream 2 has no buffer — any delay will compound across programme",
      "3 actions overdue with no owner response after 48h",
    ],
    phases: [
      { label: "Initiation",   pct: 100, status: "done"   },
      { label: "Workstream 1", pct: 60,  status: "active" },
      { label: "Workstream 2", pct: 40,  status: "active" },
      { label: "Workstream 3", pct: 20,  status: "active" },
      { label: "Close-out",    pct: 0,   status: "upcoming" },
    ],
    tasks: [
      { owner: "SR", task: "Chase client for deliverables sign-off",   due: "Today",  status: "overdue" },
      { owner: "LP", task: "Resolve cross-team dependency conflicts",   due: "Today",  status: "pending" },
      { owner: "AK", task: "Update project tracker with latest status", due: "Mar 22", status: "done"    },
      { owner: "ME", task: "Workstream 2 milestone report",             due: "Mar 25", status: "pending" },
      { owner: "LP", task: "Steering committee update deck",            due: "Mar 26", status: "pending" },
      { owner: "SR", task: "Document cross-workstream dependencies",    due: "Mar 23", status: "pending" },
      { owner: "AK", task: "Resource availability check for close-out", due: "Mar 24", status: "pending" },
    ],
    risks: [
      {
        id: "r1", title: "Client deliverables stalled", impact: "high", likelihood: "high",
        owner: "SR", status: "open",
        mitigation: "SR to escalate directly to client PM by EOD Mar 20. LP to raise at steering committee if unresolved by Mar 22. Contingency: proceed with best available data and flag gap in close-out report.",
      },
      {
        id: "r2", title: "Workstream 2 critical path", impact: "high", likelihood: "medium",
        owner: "ME", status: "open",
        mitigation: "Daily checkpoint introduced for WS2. ME to flag any blockage immediately. No scope changes to be accepted for WS2 without LP sign-off.",
      },
      {
        id: "r3", title: "Resource availability for close-out", impact: "medium", likelihood: "medium",
        owner: "AK", status: "open",
        mitigation: "AK to confirm resource availability by Mar 24. Early flag if any team member has competing commitments in final week.",
      },
      {
        id: "r4", title: "Overdue actions without owners", impact: "medium", likelihood: "high",
        owner: "LP", status: "mitigated",
        mitigation: "LP has re-assigned 2 of 3 overdue actions. Remaining action escalated to department head.",
      },
    ],
    budget: {
      total: 65000,
      spent: 38200,
      forecast: 62800,
      categories: [
        { name: "People",         budget: 45000, spent: 27500 },
        { name: "Infrastructure", budget: 5000,  spent: 3100  },
        { name: "Tools",          budget: 4000,  spent: 2800  },
        { name: "External",       budget: 8000,  spent: 4800  },
        { name: "Contingency",    budget: 3000,  spent: 0     },
      ],
      lineItems: [
        { category: "People",         description: "Programme lead (LP) — 6 weeks",     budget: 18000, spent: 10800 },
        { category: "People",         description: "Workstream leads × 3",              budget: 21000, spent: 13200 },
        { category: "People",         description: "Analyst support (AK)",              budget: 6000,  spent: 3500  },
        { category: "Infrastructure", description: "Collaboration tooling licences",    budget: 5000,  spent: 3100  },
        { category: "Tools",          description: "Project tracking software",         budget: 4000,  spent: 2800  },
        { category: "External",       description: "Steering committee facilitation",   budget: 5000,  spent: 3200  },
        { category: "External",       description: "External client review sessions",   budget: 3000,  spent: 1600  },
      ],
    },
    meetings: [
      {
        id: "m1", title: "Weekly Steering Committee", date: "Mar 18",
        attendees: ["LP", "SR", "AK", "Exec"],
        summary: "Exec acknowledged timeline pressure and approved additional resource allocation for close-out. LP presented workstream status update — WS1 on track, WS2 at risk, WS3 behind. Decision made to de-scope two WS3 deliverables to protect the Mar 28 deadline.",
        actions: [
          { text: "LP to confirm de-scoped WS3 items with client", owner: "LP", status: "pending" },
          { text: "AK to update programme tracker",                owner: "AK", status: "done"    },
          { text: "SR to chase client sign-off",                   owner: "SR", status: "pending" },
        ],
      },
      {
        id: "m2", title: "Workstream 2 Deep Dive", date: "Mar 14",
        attendees: ["ME", "LP"],
        summary: "WS2 is 6 days behind schedule due to delayed client data provision. ME outlined two recovery options: compress testing phase by 3 days (accepted) and reduce documentation scope (partially accepted). Revised plan submitted for LP sign-off.",
        actions: [
          { text: "ME to compress WS2 testing plan",      owner: "ME", status: "done" },
          { text: "LP to sign off revised WS2 schedule",  owner: "LP", status: "done" },
        ],
      },
    ],
    milestones: [
      { label: "Programme initiation",    date: "Feb 10", daysFromToday: -38, status: "done"     },
      { label: "Workstream kickoffs",      date: "Feb 17", daysFromToday: -31, status: "done"     },
      { label: "WS1 midpoint review",     date: "Mar 5",  daysFromToday: -15, status: "done"     },
      { label: "Client data submission",  date: "Mar 12", daysFromToday: -8,  status: "overdue"  },
      { label: "WS2 delivery",            date: "Mar 25", daysFromToday: 5,   status: "upcoming" },
      { label: "WS3 delivery",            date: "Mar 26", daysFromToday: 6,   status: "upcoming" },
      { label: "Close-out & sign-off",    date: "Mar 28", daysFromToday: 8,   status: "upcoming" },
    ],
  },

  vendor: {
    deadline: "Apr 12",
    deadlineDays: 23,
    progress: 88,
    openActions: 2,
    team: ["AK", "JP"],
    owner: "AK",
    larryNote: "Vendor onboarding is nearly complete and on track. The only remaining gate is contract finalisation — legal are reviewing and AK expects sign-off by Apr 2. Finance sign-off on vendor payment terms is the second open action.",
    flaggedRisks: [
      "Contract review may extend if legal requests material revisions",
    ],
    phases: [
      { label: "Vendor Selection", pct: 100, status: "done"     },
      { label: "Due Diligence",    pct: 100, status: "done"     },
      { label: "Contracting",      pct: 80,  status: "active"   },
      { label: "Integration",      pct: 0,   status: "upcoming" },
    ],
    tasks: [
      { owner: "AK", task: "Finalise vendor contract",          due: "Apr 2",  status: "pending" },
      { owner: "JP", task: "Finance sign-off on vendor terms",  due: "Apr 5",  status: "pending" },
      { owner: "AK", task: "Onboarding portal access set up",   due: "Mar 20", status: "done"    },
      { owner: "JP", task: "Risk assessment completed",         due: "Mar 18", status: "done"    },
    ],
    risks: [
      {
        id: "r1", title: "Legal contract revision requests", impact: "medium", likelihood: "low",
        owner: "AK", status: "mitigated",
        mitigation: "AK has agreed a revision deadline of Mar 28 with legal team. One round of revisions allowed; further rounds escalate to CLO. Target sign-off Apr 2.",
      },
      {
        id: "r2", title: "Finance approval delay", impact: "low", likelihood: "low",
        owner: "JP", status: "open",
        mitigation: "JP submitted request Mar 19. Finance SLA is 5 business days. No action needed unless delayed beyond Apr 2.",
      },
      {
        id: "r3", title: "Vendor data integration complexity", impact: "medium", likelihood: "low",
        owner: "AK", status: "closed",
        mitigation: "Technical scoping completed Feb 28. Integration approach agreed with vendor. No additional complexity identified. Closed.",
      },
    ],
    budget: {
      total: 42000,
      spent: 34800,
      forecast: 40200,
      categories: [
        { name: "People",         budget: 22000, spent: 18400 },
        { name: "Infrastructure", budget: 6000,  spent: 4800  },
        { name: "Tools",          budget: 3000,  spent: 2600  },
        { name: "External",       budget: 8000,  spent: 7200  },
        { name: "Contingency",    budget: 3000,  spent: 1800  },
      ],
      lineItems: [
        { category: "People",         description: "Procurement lead (AK) — 8 weeks",  budget: 14000, spent: 11800 },
        { category: "People",         description: "Finance analyst (JP)",              budget: 8000,  spent: 6600  },
        { category: "Infrastructure", description: "Vendor portal setup",               budget: 6000,  spent: 4800  },
        { category: "Tools",          description: "Contract management software",      budget: 3000,  spent: 2600  },
        { category: "External",       description: "Legal review fees",                 budget: 8000,  spent: 7200  },
      ],
    },
    meetings: [
      {
        id: "m1", title: "Contract Negotiation Session", date: "Mar 16",
        attendees: ["AK", "JP", "Vendor"],
        summary: "Final commercial terms agreed with vendor. Payment schedule confirmed as 30/30/40 split on onboarding milestones. Vendor accepted indemnity clause with minor wording adjustment. Legal to review final draft within 5 working days.",
        actions: [
          { text: "Legal to review final contract draft",        owner: "Legal", status: "pending" },
          { text: "JP to prepare payment schedule for Finance",  owner: "JP",    status: "done"    },
        ],
      },
      {
        id: "m2", title: "Vendor Technical Review", date: "Mar 5",
        attendees: ["AK", "Vendor"],
        summary: "Technical integration approach validated. Vendor confirmed API documentation is current and full sandbox access granted. AK completed connectivity test — all endpoints responding correctly. Integration phase estimated at 3–5 days of effort.",
        actions: [
          { text: "AK to document integration test results",  owner: "AK", status: "done" },
          { text: "Vendor to provide production credentials",  owner: "Vendor", status: "done" },
        ],
      },
    ],
    milestones: [
      { label: "Vendor shortlist agreed",    date: "Feb 1",  daysFromToday: -47, status: "done"     },
      { label: "Due diligence complete",     date: "Feb 20", daysFromToday: -28, status: "done"     },
      { label: "Commercial terms agreed",    date: "Mar 16", daysFromToday: -4,  status: "done"     },
      { label: "Portal access live",         date: "Mar 20", daysFromToday: 0,   status: "done"     },
      { label: "Contract signed",            date: "Apr 2",  daysFromToday: 13,  status: "upcoming" },
      { label: "Finance sign-off",           date: "Apr 5",  daysFromToday: 16,  status: "upcoming" },
      { label: "Integration go-live",        date: "Apr 12", daysFromToday: 23,  status: "upcoming" },
    ],
  },

  platform: {
    deadline: "Mar 20",
    deadlineDays: 0,
    progress: 31,
    openActions: 6,
    team: ["ME", "TK", "LP"],
    owner: "ME",
    larryNote: "The deadline is today and the project is only 31% complete. The security review is blocked on auth layer remediation — this has been escalated. Migration cannot proceed until security sign-off is obtained. I've flagged this to ME and LP.",
    flaggedRisks: [
      "Security review blocked on auth remediation — migration cannot proceed",
      "5-day delay if gaps not resolved by Mar 22 — ops window may need rescheduling",
      "No buffer in plan for additional security findings",
    ],
    phases: [
      { label: "Assessment",  pct: 100, status: "done"     },
      { label: "Security",    pct: 40,  status: "active"   },
      { label: "Migration",   pct: 0,   status: "upcoming" },
      { label: "Validation",  pct: 0,   status: "upcoming" },
      { label: "Cutover",     pct: 0,   status: "upcoming" },
    ],
    tasks: [
      { owner: "ME", task: "Remediate auth layer security gaps",       due: "Mar 22", status: "overdue" },
      { owner: "LP", task: "Update steering committee on timeline",    due: "Mar 21", status: "done"    },
      { owner: "TK", task: "Review remediation plan before sign-off", due: "Mar 23", status: "pending" },
      { owner: "ME", task: "Data migration dry-run",                  due: "Mar 27", status: "pending" },
      { owner: "TK", task: "Load testing on new infrastructure",      due: "Mar 29", status: "pending" },
      { owner: "LP", task: "Book ops maintenance window",             due: "Mar 25", status: "pending" },
    ],
    risks: [
      {
        id: "r1", title: "Auth layer security gaps", impact: "high", likelihood: "high",
        owner: "ME", status: "open",
        mitigation: "ME is leading remediation with daily progress checks. External security firm engaged for independent validation. Target sign-off Mar 22. If not met, ops window moves to Mar 27 at earliest.",
      },
      {
        id: "r2", title: "Migration window scheduling", impact: "high", likelihood: "medium",
        owner: "LP", status: "open",
        mitigation: "LP to renegotiate ops window with infrastructure team. Earliest alternative window is Mar 27–28. Comms plan required for affected teams.",
      },
      {
        id: "r3", title: "Additional security findings", impact: "high", likelihood: "medium",
        owner: "TK", status: "open",
        mitigation: "TK to triage any additional findings in remediation review. Critical findings halt migration. High findings require documented acceptance. Medium/Low findings logged for post-migration backlog.",
      },
      {
        id: "r4", title: "Data integrity during migration", impact: "high", likelihood: "low",
        owner: "ME", status: "mitigated",
        mitigation: "Dry-run scheduled Mar 27. Full rollback plan documented. Point-in-time recovery enabled on all databases. Monitoring alerts configured.",
      },
    ],
    budget: {
      total: 85000,
      spent: 71200,
      forecast: 102400,
      categories: [
        { name: "People",         budget: 48000, spent: 42800 },
        { name: "Infrastructure", budget: 20000, spent: 19400 },
        { name: "Tools",          budget: 6000,  spent: 4800  },
        { name: "External",       budget: 8000,  spent: 4200  },
        { name: "Contingency",    budget: 3000,  spent: 0     },
      ],
      lineItems: [
        { category: "People",         description: "Platform engineer (ME) — 10 weeks",    budget: 22000, spent: 20800 },
        { category: "People",         description: "DevOps lead (TK)",                     budget: 18000, spent: 16000 },
        { category: "People",         description: "Programme oversight (LP)",              budget: 8000,  spent: 6000  },
        { category: "Infrastructure", description: "New cloud infrastructure provisioning", budget: 14000, spent: 13800 },
        { category: "Infrastructure", description: "Legacy system decommission costs",     budget: 6000,  spent: 5600  },
        { category: "Tools",          description: "Security scanning tools",               budget: 4000,  spent: 3200  },
        { category: "Tools",          description: "Migration tooling licences",            budget: 2000,  spent: 1600  },
        { category: "External",       description: "External security audit firm",          budget: 8000,  spent: 4200  },
      ],
    },
    meetings: [
      {
        id: "m1", title: "Security Review Escalation", date: "Mar 19",
        attendees: ["ME", "LP", "TK", "CISO"],
        summary: "CISO confirmed the auth layer gaps constitute a blocking issue. External security firm to be engaged for independent remediation review. ME presented 3-day recovery plan — CISO conditionally approved subject to independent sign-off. Migration window formally postponed.",
        actions: [
          { text: "ME to engage external security firm",      owner: "ME", status: "done"    },
          { text: "LP to rebook ops window for Mar 27–28",   owner: "LP", status: "pending" },
          { text: "TK to prepare remediation review doc",    owner: "TK", status: "pending" },
        ],
      },
      {
        id: "m2", title: "Infrastructure Readiness Review", date: "Mar 12",
        attendees: ["ME", "TK"],
        summary: "New cloud infrastructure provisioning complete. Load testing baseline established — results within acceptable thresholds. Security scan surfaced two medium and one high finding that require remediation before migration can proceed. This is the current blocker.",
        actions: [
          { text: "ME to triage security findings",          owner: "ME", status: "done" },
          { text: "TK to document load test results",        owner: "TK", status: "done" },
        ],
      },
    ],
    milestones: [
      { label: "Assessment complete",     date: "Feb 14", daysFromToday: -34, status: "done"     },
      { label: "Infrastructure live",     date: "Mar 12", daysFromToday: -8,  status: "done"     },
      { label: "Security sign-off",       date: "Mar 20", daysFromToday: 0,   status: "overdue"  },
      { label: "Security remediation",    date: "Mar 22", daysFromToday: 2,   status: "upcoming" },
      { label: "Data migration dry-run",  date: "Mar 27", daysFromToday: 7,   status: "upcoming" },
      { label: "Load testing",            date: "Mar 29", daysFromToday: 9,   status: "upcoming" },
      { label: "Production cutover",      date: "Apr 1",  daysFromToday: 12,  status: "upcoming" },
    ],
  },

  analytics: {
    deadline: "May 30",
    deadlineDays: 71,
    progress: 0,
    openActions: 0,
    team: ["JP", "AK"],
    owner: "JP",
    larryNote: "This project has not yet kicked off — no scoping meeting has been scheduled and no budget has been confirmed. I'd recommend JP books a scoping session before end of March to protect the May 30 delivery date.",
    flaggedRisks: [
      "Late kickoff risks compressing build and testing phases",
    ],
    phases: [
      { label: "Scoping",       pct: 0, status: "upcoming" },
      { label: "Data Mapping",  pct: 0, status: "upcoming" },
      { label: "Build",         pct: 0, status: "upcoming" },
      { label: "Testing",       pct: 0, status: "upcoming" },
    ],
    tasks: [],
    risks: [
      {
        id: "r1", title: "Late project kickoff", impact: "medium", likelihood: "high",
        owner: "JP", status: "open",
        mitigation: "JP to schedule scoping session by Mar 31. Without scoping complete by Apr 5, build phase will compress below minimum viable duration.",
      },
      {
        id: "r2", title: "Data quality and availability", impact: "high", likelihood: "medium",
        owner: "AK", status: "open",
        mitigation: "AK to conduct preliminary data audit during scoping. Data source owners to be identified before data mapping phase begins.",
      },
    ],
    budget: {
      total: 55000,
      spent: 0,
      forecast: 55000,
      categories: [
        { name: "People",         budget: 32000, spent: 0 },
        { name: "Infrastructure", budget: 10000, spent: 0 },
        { name: "Tools",          budget: 8000,  spent: 0 },
        { name: "External",       budget: 3000,  spent: 0 },
        { name: "Contingency",    budget: 2000,  spent: 0 },
      ],
      lineItems: [
        { category: "People",         description: "Data analyst (JP) — 10 weeks",    budget: 18000, spent: 0 },
        { category: "People",         description: "BI developer (AK) — 8 weeks",     budget: 14000, spent: 0 },
        { category: "Infrastructure", description: "Data warehouse provisioning",     budget: 7000,  spent: 0 },
        { category: "Infrastructure", description: "ETL pipeline infrastructure",     budget: 3000,  spent: 0 },
        { category: "Tools",          description: "BI tooling licences (annual)",    budget: 6000,  spent: 0 },
        { category: "Tools",          description: "Data quality tooling",            budget: 2000,  spent: 0 },
        { category: "External",       description: "Data strategy consultant",        budget: 3000,  spent: 0 },
      ],
    },
    meetings: [],
    milestones: [
      { label: "Scoping kickoff",       date: "Apr 1",  daysFromToday: 12, status: "upcoming" },
      { label: "Data mapping complete", date: "Apr 25", daysFromToday: 36, status: "upcoming" },
      { label: "Build start",           date: "May 1",  daysFromToday: 42, status: "upcoming" },
      { label: "Testing start",         date: "May 19", daysFromToday: 60, status: "upcoming" },
      { label: "Go-live",               date: "May 30", daysFromToday: 71, status: "upcoming" },
    ],
  },
};

/* ─── Props ─────────────────────────────────────────────────────────────── */

interface ProjectHubProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

/* ─── Config maps ───────────────────────────────────────────────────────── */

const PHASE_STYLE: Record<Phase["status"], { track: string; fill: string; label: string }> = {
  done:     { track: "bg-emerald-100", fill: "bg-emerald-400",                          label: "text-emerald-600"              },
  active:   { track: "bg-[var(--color-brand)]/10", fill: "bg-[var(--color-brand)]",     label: "text-[var(--color-brand)]"     },
  upcoming: { track: "bg-neutral-100", fill: "bg-neutral-300",                          label: "text-neutral-400"              },
};

const TASK_STATUS_CFG: Record<HubTask["status"], { badge: string; label: string }> = {
  pending: { badge: "bg-amber-50 text-amber-600 border-amber-100",        label: "Pending"  },
  done:    { badge: "bg-emerald-50 text-emerald-600 border-emerald-100",  label: "Done"     },
  overdue: { badge: "bg-red-50 text-red-500 border-red-100",              label: "Overdue"  },
};

const IMPACT_CFG: Record<Risk["impact"], { badge: string; label: string }> = {
  high:   { badge: "bg-red-50 text-red-500 border-red-100",        label: "High"   },
  medium: { badge: "bg-amber-50 text-amber-600 border-amber-100",  label: "Medium" },
  low:    { badge: "bg-neutral-100 text-neutral-500 border-neutral-200", label: "Low" },
};

const LIKELIHOOD_CFG: Record<Risk["likelihood"], { badge: string }> = {
  high:   { badge: "bg-red-50 text-red-500 border-red-100"        },
  medium: { badge: "bg-amber-50 text-amber-600 border-amber-100"  },
  low:    { badge: "bg-neutral-100 text-neutral-500 border-neutral-200" },
};

const RISK_STATUS_CFG: Record<Risk["status"], { badge: string; label: string }> = {
  open:      { badge: "bg-red-50 text-red-500 border-red-100",             label: "Open"      },
  mitigated: { badge: "bg-amber-50 text-amber-600 border-amber-100",       label: "Mitigated" },
  closed:    { badge: "bg-emerald-50 text-emerald-600 border-emerald-100", label: "Closed"    },
};

const MILESTONE_CFG: Record<Milestone["status"], { dot: string; line: string; badge: string; label: string }> = {
  done:     { dot: "bg-emerald-400 border-emerald-200", line: "bg-emerald-200", badge: "bg-emerald-50 text-emerald-600 border-emerald-100",    label: "Done"     },
  upcoming: { dot: "bg-[var(--color-brand)] border-[var(--color-brand)]/30", line: "bg-neutral-100", badge: "bg-[var(--color-brand)]/8 text-[var(--color-brand)] border-[var(--color-brand)]/20", label: "Upcoming" },
  overdue:  { dot: "bg-red-400 border-red-200",         line: "bg-red-100",    badge: "bg-red-50 text-red-500 border-red-100",                label: "Overdue"  },
};

/* ─── Progress ring ─────────────────────────────────────────────────────── */

function ProgressRing({ pct, color = "#8b5cf6", size = 72 }: { pct: number; color?: string; size?: number }) {
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="7" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct / 100) }}
          transition={{ duration: 1.1, ease: EASE }}
        />
      </svg>
      <span className="relative text-base font-bold text-neutral-900">{pct}%</span>
    </div>
  );
}

/* ─── Avatar bubble ─────────────────────────────────────────────────────── */

function Avatar({ initials, size = "sm" }: { initials: string; size?: "xs" | "sm" | "md" }) {
  const cls = size === "xs"
    ? "h-5 w-5 text-[7px]"
    : size === "sm"
    ? "h-6 w-6 text-[9px]"
    : "h-8 w-8 text-xs";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-[var(--color-brand)]/10 font-bold text-[var(--color-brand)] ${cls}`}>
      {initials}
    </span>
  );
}

/* ─── KPI card ──────────────────────────────────────────────────────────── */

function KpiCard({ label, children, accent = false }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border border-neutral-100 bg-white p-5 shadow-card ${accent ? "ring-1 ring-[var(--color-brand)]/10" : ""}`}>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{label}</p>
      {children}
    </div>
  );
}

/* ─── Tab: Overview ─────────────────────────────────────────────────────── */

function OverviewTab({ data }: { data: HubData }) {
  const deadlineUrgent = data.deadlineDays <= 7;
  const overBudget = data.budget.forecast > data.budget.total;

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="space-y-5"
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Progress" accent>
          <div className="flex items-center gap-4">
            <ProgressRing pct={data.progress} color="#8b5cf6" size={64} />
            <div>
              <p className="text-2xl font-bold text-neutral-900">{data.progress}%</p>
              <p className="mt-0.5 text-[10px] text-neutral-400">Complete</p>
            </div>
          </div>
        </KpiCard>

        <KpiCard label="Days Remaining">
          <p className={`text-3xl font-bold leading-none ${deadlineUrgent ? "text-red-500" : "text-neutral-900"}`}>
            {data.deadlineDays <= 0 ? "Due" : data.deadlineDays}
          </p>
          <p className={`mt-1.5 text-[10px] ${deadlineUrgent ? "text-red-400" : "text-neutral-400"}`}>
            {data.deadlineDays <= 0 ? "Today" : `Until ${data.deadline}`}
          </p>
          {deadlineUrgent && (
            <span className="mt-2 inline-flex rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[9px] font-medium text-red-500">
              Urgent
            </span>
          )}
        </KpiCard>

        <KpiCard label="Open Actions">
          <p className="text-3xl font-bold leading-none text-amber-500">{data.openActions}</p>
          <p className="mt-1.5 text-[10px] text-neutral-400">Require attention</p>
          {data.openActions === 0 && (
            <span className="mt-2 inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-600">
              All clear
            </span>
          )}
        </KpiCard>

        <KpiCard label="Team">
          <p className="text-3xl font-bold leading-none text-[var(--color-brand)]">{data.team.length}</p>
          <div className="mt-2 flex -space-x-1.5">
            {data.team.map((m) => (
              <Avatar key={m} initials={m} size="xs" />
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-neutral-400">Members</p>
        </KpiCard>
      </div>

      {/* Two-column detail */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

        {/* Project phases */}
        <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-card">
          <h3 className="mb-4 text-xs font-semibold text-neutral-800">Project Phases</h3>
          {data.phases.length === 0 ? (
            <p className="text-xs italic text-neutral-400">No phases defined yet.</p>
          ) : (
            <div className="space-y-3.5">
              {data.phases.map((phase, i) => {
                const ps = PHASE_STYLE[phase.status];
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`w-28 shrink-0 text-[10px] font-medium ${ps.label}`}>{phase.label}</span>
                    <div className={`h-2 flex-1 overflow-hidden rounded-full ${ps.track}`}>
                      <motion.div
                        className={`h-full rounded-full ${ps.fill}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${phase.pct}%` }}
                        transition={{ duration: 0.85, ease: EASE, delay: i * 0.06 }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-[10px] text-neutral-400">
                      {phase.pct > 0 ? `${phase.pct}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Budget summary bar */}
          <div className="mt-5 border-t border-neutral-50 pt-4">
            <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-2">
              <span>Budget spent</span>
              <span className={overBudget ? "text-red-400 font-medium" : "text-neutral-400"}>
                £{data.budget.spent.toLocaleString()} / £{data.budget.total.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <motion.div
                className={`h-full rounded-full ${overBudget ? "bg-red-400" : "bg-[var(--color-brand)]"}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((data.budget.spent / data.budget.total) * 100, 100)}%` }}
                transition={{ duration: 0.9, ease: EASE }}
              />
            </div>
          </div>
        </div>

        {/* Larry's note */}
        <div className="rounded-2xl border border-[var(--color-brand)]/15 bg-gradient-to-br from-white to-[var(--color-brand)]/3 p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand)] text-xs font-bold text-white shadow-sm">
              L
            </span>
            <div>
              <p className="text-xs font-semibold text-neutral-800">Larry&apos;s Note</p>
              <p className="text-[10px] text-neutral-400">AI project intelligence</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-neutral-600">{data.larryNote}</p>
          {data.flaggedRisks.length > 0 && (
            <div className="mt-4 border-t border-[var(--color-brand)]/10 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-500">Flagged Risks</p>
              <ul className="space-y-2">
                {data.flaggedRisks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <p className="text-[11px] leading-relaxed text-neutral-600">{r}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

      </div>
    </motion.div>
  );
}

/* ─── Tab: Tasks ────────────────────────────────────────────────────────── */

type TaskFilter = "all" | "pending" | "done" | "overdue";

function TasksTab({ data }: { data: HubData }) {
  const [filter, setFilter] = useState<TaskFilter>("all");

  const counts: Record<TaskFilter, number> = {
    all:     data.tasks.length,
    pending: data.tasks.filter((t) => t.status === "pending").length,
    done:    data.tasks.filter((t) => t.status === "done").length,
    overdue: data.tasks.filter((t) => t.status === "overdue").length,
  };

  const filtered = filter === "all" ? data.tasks : data.tasks.filter((t) => t.status === filter);

  const FILTERS: { id: TaskFilter; label: string }[] = [
    { id: "all",     label: "All"     },
    { id: "pending", label: "Pending" },
    { id: "done",    label: "Done"    },
    { id: "overdue", label: "Overdue" },
  ];

  const FILTER_ACTIVE: Record<TaskFilter, string> = {
    all:     "bg-neutral-800 text-white",
    pending: "bg-amber-500 text-white",
    done:    "bg-emerald-500 text-white",
    overdue: "bg-red-500 text-white",
  };

  return (
    <motion.div
      key="tasks"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="space-y-4"
    >
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ id, label }) => (
          <motion.button
            key={id}
            onClick={() => setFilter(id)}
            whileTap={{ scale: 0.95 }}
            className={[
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
              filter === id
                ? `${FILTER_ACTIVE[id]} border-transparent shadow-sm`
                : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-700",
            ].join(" ")}
          >
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${filter === id ? "bg-white/20" : "bg-neutral-100 text-neutral-400"}`}>
              {counts[id]}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Task list */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-neutral-100 bg-white p-10 text-center shadow-card"
          >
            <p className="text-sm text-neutral-400">No {filter === "all" ? "" : filter} tasks.</p>
          </motion.div>
        ) : (
          <motion.div
            key={filter}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="rounded-2xl border border-neutral-100 bg-white shadow-card overflow-hidden"
          >
            <ul role="list" className="divide-y divide-neutral-50">
              {filtered.map((t, i) => {
                const sc = TASK_STATUS_CFG[t.status];
                return (
                  <motion.li
                    key={`${t.owner}-${t.task}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, ease: EASE, delay: i * 0.04 }}
                    className="flex items-start gap-3 px-5 py-4 hover:bg-neutral-50/60 transition-colors"
                  >
                    <Avatar initials={t.owner} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-neutral-700 leading-snug">{t.task}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-400">
                          Due {t.due}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${sc.badge}`}>
                          {sc.label}
                        </span>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Risk matrix dot ───────────────────────────────────────────────────── */

function matrixPosition(impact: Risk["impact"], likelihood: Risk["likelihood"]): { top: string; left: string } {
  const topMap = { high: "15%", medium: "48%", low: "78%" };
  const leftMap = { low: "18%", medium: "51%", high: "81%" };
  return { top: topMap[impact], left: leftMap[likelihood] };
}

const IMPACT_DOT: Record<Risk["impact"], string> = {
  high:   "bg-red-400",
  medium: "bg-amber-400",
  low:    "bg-emerald-400",
};

/* ─── Tab: Risks ────────────────────────────────────────────────────────── */

function RisksTab({ data }: { data: HubData }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <motion.div
      key="risks"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="space-y-5"
    >
      {/* Risk matrix */}
      <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-card">
        <h3 className="mb-4 text-xs font-semibold text-neutral-800">Risk Matrix</h3>
        <div className="flex gap-4 items-start">
          {/* Y axis label */}
          <div className="flex flex-col items-center justify-center self-stretch gap-1 pb-6">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
              Impact
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Matrix grid */}
            <div className="relative grid grid-cols-2 grid-rows-2 gap-px rounded-xl overflow-hidden border border-neutral-100"
              style={{ height: 200 }}>
              <div className="bg-red-50/70 flex items-start justify-start p-2">
                <span className="text-[9px] font-medium text-red-300">High Impact / Low Likelihood</span>
              </div>
              <div className="bg-red-100/70 flex items-start justify-start p-2">
                <span className="text-[9px] font-medium text-red-400">High Impact / High Likelihood</span>
              </div>
              <div className="bg-amber-50/70 flex items-start justify-start p-2">
                <span className="text-[9px] font-medium text-amber-300">Low Impact / Low Likelihood</span>
              </div>
              <div className="bg-amber-100/70 flex items-start justify-start p-2">
                <span className="text-[9px] font-medium text-amber-400">Low Impact / High Likelihood</span>
              </div>

              {/* Risk dots */}
              {data.risks.map((risk) => {
                const pos = matrixPosition(risk.impact, risk.likelihood);
                return (
                  <motion.div
                    key={risk.id}
                    title={risk.title}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={`absolute h-3 w-3 rounded-full border-2 border-white shadow-sm cursor-pointer ${IMPACT_DOT[risk.impact]}`}
                    style={{ top: pos.top, left: pos.left, transform: "translate(-50%, -50%)", position: "absolute" }}
                  />
                );
              })}
            </div>

            {/* X axis */}
            <div className="mt-1.5 flex justify-between px-2">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">Low</span>
              <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">Likelihood</span>
              <span className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">High</span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-3">
          {[
            { color: "bg-red-400",     label: "High impact"   },
            { color: "bg-amber-400",   label: "Medium impact" },
            { color: "bg-emerald-400", label: "Low impact"    },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-[10px] text-neutral-400">
              <span className={`h-2 w-2 rounded-full ${color}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Risk register */}
      <div className="rounded-2xl border border-neutral-100 bg-white shadow-card overflow-hidden">
        <div className="border-b border-neutral-50 px-5 py-3.5">
          <h3 className="text-xs font-semibold text-neutral-800">Risk Register</h3>
        </div>

        {data.risks.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs italic text-neutral-400">No risks logged for this project.</p>
        ) : (
          <ul role="list" className="divide-y divide-neutral-50">
            {data.risks.map((risk) => {
              const ic = IMPACT_CFG[risk.impact];
              const lc = LIKELIHOOD_CFG[risk.likelihood];
              const sc = RISK_STATUS_CFG[risk.status];
              const isExpanded = expandedId === risk.id;

              return (
                <li key={risk.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : risk.id)}
                    className="w-full text-left px-5 py-4 hover:bg-neutral-50/60 transition-colors"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <p className="flex-1 text-xs font-medium text-neutral-700">{risk.title}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${ic.badge}`}>
                          {ic.label}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${lc.badge}`}>
                          {IMPACT_CFG[risk.likelihood].label}
                        </span>
                        <Avatar initials={risk.owner} size="xs" />
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${sc.badge}`}>
                          {sc.label}
                        </span>
                        <motion.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2, ease: EASE }}
                          className="text-neutral-300"
                        >
                          <ChevronDown size={13} />
                        </motion.span>
                      </div>
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-neutral-50 bg-neutral-50/40 px-5 py-4">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">Mitigation</p>
                          <p className="text-xs leading-relaxed text-neutral-600">{risk.mitigation}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Tab: Costs ────────────────────────────────────────────────────────── */

function CostsTab({ data }: { data: HubData }) {
  const { budget } = data;
  const spentPct = budget.total > 0 ? Math.round((budget.spent / budget.total) * 100) : 0;
  const overBudget = budget.forecast > budget.total;
  const forecastDiff = budget.forecast - budget.total;

  return (
    <motion.div
      key="costs"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="space-y-5"
    >
      {/* Top 3 KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Total Budget">
          <p className="text-2xl font-bold text-neutral-900">£{budget.total.toLocaleString()}</p>
          <p className="mt-1 text-[10px] text-neutral-400">Approved</p>
        </KpiCard>

        <KpiCard label="Spent to Date">
          <p className="text-2xl font-bold text-neutral-900">£{budget.spent.toLocaleString()}</p>
          <p className="mt-1 text-[10px] text-neutral-400">{spentPct}% of budget</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <motion.div
              className="h-full rounded-full bg-[var(--color-brand)]"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(spentPct, 100)}%` }}
              transition={{ duration: 0.9, ease: EASE }}
            />
          </div>
        </KpiCard>

        <KpiCard label="Forecast at Completion">
          <p className={`text-2xl font-bold ${overBudget ? "text-red-500" : "text-emerald-500"}`}>
            £{budget.forecast.toLocaleString()}
          </p>
          <p className={`mt-1 text-[10px] ${overBudget ? "text-red-400" : "text-emerald-400"}`}>
            {overBudget
              ? `£${Math.abs(forecastDiff).toLocaleString()} over budget`
              : forecastDiff === 0
              ? "On budget"
              : `£${Math.abs(forecastDiff).toLocaleString()} under budget`}
          </p>
        </KpiCard>
      </div>

      {/* Spend by category */}
      <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-card">
        <h3 className="mb-4 text-xs font-semibold text-neutral-800">Spend by Category</h3>
        <div className="space-y-4">
          {budget.categories.map((cat, i) => {
            const budgetPct = budget.total > 0 ? (cat.budget / budget.total) * 100 : 0;
            const spentOfBudget = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0;
            return (
              <div key={cat.name}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-neutral-600">{cat.name}</span>
                  <div className="flex items-center gap-3 text-[10px] text-neutral-400">
                    <span className="text-[var(--color-brand)] font-medium">£{cat.spent.toLocaleString()}</span>
                    <span>/ £{cat.budget.toLocaleString()}</span>
                  </div>
                </div>
                {/* Budget bar track */}
                <div className="relative h-3 rounded-full bg-neutral-100 overflow-hidden">
                  {/* Budget allocation relative to total */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-neutral-200"
                    style={{ width: `${budgetPct}%` }}
                  />
                  {/* Spent amount */}
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-brand)] opacity-80"
                    initial={{ width: 0 }}
                    animate={{ width: `${(cat.spent / budget.total) * 100}%` }}
                    transition={{ duration: 0.8, ease: EASE, delay: i * 0.05 }}
                  />
                </div>
                <div className="mt-1 text-right text-[9px] text-neutral-400">{Math.round(spentOfBudget)}% of category budget</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Line items table */}
      <div className="rounded-2xl border border-neutral-100 bg-white shadow-card overflow-hidden">
        <div className="border-b border-neutral-50 px-5 py-3.5">
          <h3 className="text-xs font-semibold text-neutral-800">Line Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b border-neutral-50 bg-neutral-50/60">
                <th className="py-2.5 pl-5 pr-3 text-left text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Category</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Description</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Budget</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Spent</th>
                <th className="py-2.5 pl-3 pr-5 text-right text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {budget.lineItems.map((item, i) => {
                const variance = item.budget - item.spent;
                return (
                  <tr key={i} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-3 pl-5 pr-3 text-[10px] font-medium text-neutral-500">{item.category}</td>
                    <td className="px-3 py-3 text-neutral-600">{item.description}</td>
                    <td className="px-3 py-3 text-right font-mono text-neutral-500">£{item.budget.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right font-mono text-neutral-700">£{item.spent.toLocaleString()}</td>
                    <td className={`py-3 pl-3 pr-5 text-right font-mono font-medium ${variance >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {variance >= 0 ? "+" : ""}£{variance.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Tab: Meetings ─────────────────────────────────────────────────────── */

function MeetingsTab({ data }: { data: HubData }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (data.meetings.length === 0) {
    return (
      <motion.div
        key="meetings"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.28, ease: EASE }}
        className="rounded-2xl border border-neutral-100 bg-white p-10 text-center shadow-card"
      >
        <p className="text-sm text-neutral-400">No meetings recorded yet.</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="meetings"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="space-y-3"
    >
      {data.meetings.map((meeting) => {
        const isExpanded = expandedId === meeting.id;
        const [day, month] = meeting.date.split(" ");
        const pendingActions = meeting.actions.filter((a) => a.status === "pending").length;

        return (
          <div key={meeting.id} className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
            <button
              onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
              className="w-full text-left p-5 hover:bg-neutral-50/40 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Date badge */}
                <div className="flex shrink-0 flex-col items-center rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5 min-w-[52px]">
                  <span className="text-lg font-bold leading-none text-neutral-900">{day}</span>
                  <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-400">{month}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start gap-2 justify-between">
                    <p className="text-sm font-semibold text-neutral-800">{meeting.title}</p>
                    <div className="flex items-center gap-2">
                      {pendingActions > 0 && (
                        <span className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-600">
                          {pendingActions} action{pendingActions > 1 ? "s" : ""}
                        </span>
                      )}
                      <motion.span
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="text-neutral-300"
                      >
                        <ChevronDown size={14} />
                      </motion.span>
                    </div>
                  </div>

                  {/* Attendees */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex -space-x-1.5">
                      {meeting.attendees.slice(0, 4).map((a) => (
                        <Avatar key={a} initials={a[0] ?? a} size="xs" />
                      ))}
                    </div>
                    {meeting.attendees.length > 4 && (
                      <span className="text-[10px] text-neutral-400">+{meeting.attendees.length - 4}</span>
                    )}
                  </div>

                  {/* Summary preview */}
                  {!isExpanded && (
                    <p className="mt-2 text-xs leading-relaxed text-neutral-500 line-clamp-2">{meeting.summary}</p>
                  )}
                </div>
              </div>
            </button>

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-neutral-50 px-5 pb-5 pt-4 space-y-4">
                    {/* Full summary */}
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Summary</p>
                      <p className="text-xs leading-relaxed text-neutral-600">{meeting.summary}</p>
                    </div>

                    {/* Actions */}
                    {meeting.actions.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Actions</p>
                        <ul className="space-y-2">
                          {meeting.actions.map((action, ai) => (
                            <li key={ai} className="flex items-start gap-3">
                              <Avatar initials={action.owner[0] ?? action.owner} size="xs" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-neutral-600">{action.text}</p>
                                <span className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${TASK_STATUS_CFG[action.status].badge}`}>
                                  {TASK_STATUS_CFG[action.status].label}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button className="text-xs font-medium text-[var(--color-brand)] hover:underline">
                      View notes →
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </motion.div>
  );
}

/* ─── Tab: Milestones ───────────────────────────────────────────────────── */

function MilestonesTab({ data }: { data: HubData }) {
  const sorted = [...data.milestones].sort((a, b) => a.daysFromToday - b.daysFromToday);
  const todayIdx = sorted.findIndex((m) => m.daysFromToday >= 0);

  return (
    <motion.div
      key="milestones"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-card"
    >
      <h3 className="mb-6 text-xs font-semibold text-neutral-800">Milestone Timeline</h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[88px] top-0 bottom-0 w-px bg-neutral-100" />

        <ul className="space-y-0">
          {sorted.map((ms, i) => {
            const mc = MILESTONE_CFG[ms.status];
            const isToday = ms.daysFromToday === 0;
            const showTodayMarker = todayIdx === i && i > 0;

            return (
              <li key={i}>
                {/* Today marker */}
                {showTodayMarker && (
                  <div className="relative flex items-center py-2">
                    <div className="absolute left-[88px] right-0 border-t-2 border-dashed border-[var(--color-brand)]/30" />
                    <span className="relative ml-[96px] rounded-full border border-[var(--color-brand)]/20 bg-[var(--color-brand)]/8 px-2.5 py-0.5 text-[9px] font-semibold text-[var(--color-brand)]">
                      Today — Mar 20
                    </span>
                  </div>
                )}

                <motion.div
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: EASE, delay: i * 0.05 }}
                  className={`relative flex items-center gap-0 py-4 ${isToday ? "bg-[var(--color-brand)]/3 -mx-3 px-3 rounded-xl" : ""}`}
                >
                  {/* Date column */}
                  <div className="w-[80px] shrink-0 text-right pr-4">
                    <span className="text-xs font-bold text-neutral-700 block">{ms.date.split(" ")[0]}</span>
                    <span className="text-[9px] text-neutral-400">{ms.date.split(" ")[1]}</span>
                  </div>

                  {/* Dot */}
                  <div className="relative flex items-center justify-center w-[16px] shrink-0">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20, delay: i * 0.05 + 0.1 }}
                      className={`h-3.5 w-3.5 rounded-full border-2 shadow-sm ${mc.dot}`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex flex-wrap items-center gap-2 pl-4 flex-1 min-w-0">
                    <p className={`text-xs font-medium ${isToday ? "text-neutral-900" : "text-neutral-700"}`}>
                      {ms.label}
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${mc.badge}`}>
                      {mc.label}
                    </span>
                    {ms.daysFromToday !== 0 && (
                      <span className="text-[10px] text-neutral-400">
                        {ms.daysFromToday > 0
                          ? `in ${ms.daysFromToday}d`
                          : `${Math.abs(ms.daysFromToday)}d ago`}
                      </span>
                    )}
                    {isToday && (
                      <span className="text-[10px] font-semibold text-[var(--color-brand)]">Today</span>
                    )}
                  </div>
                </motion.div>
              </li>
            );
          })}
        </ul>
      </div>
    </motion.div>
  );
}

/* ─── ProjectHub root ───────────────────────────────────────────────────── */

export function ProjectHub({ projectId, projectName, onBack }: ProjectHubProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const data = HUB_DATA[projectId] ?? HUB_DATA["alpha"]!;

  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "";

  return (
    <div className="flex flex-col min-h-0 pb-10">
      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-1.5 text-xs text-neutral-400 flex-wrap">
        <motion.button
          onClick={onBack}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1.5 font-medium text-[var(--color-brand)] hover:underline"
        >
          <ArrowLeft size={13} />
          Projects
        </motion.button>
        <ChevronRight size={11} className="text-neutral-300" />
        <span className="font-medium text-neutral-600">{projectName}</span>
        <ChevronRight size={11} className="text-neutral-300" />
        <span className="font-medium text-neutral-500">{activeLabel}</span>
      </div>

      {/* Sticky tab bar */}
      <div className="sticky top-0 z-20 -mx-1 mb-5 overflow-x-auto">
        <div className="flex min-w-max gap-0 rounded-2xl border border-neutral-100 bg-white px-2 py-1.5 shadow-card">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileTap={{ scale: 0.96 }}
                className={[
                  "relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors duration-150",
                  isActive
                    ? "text-[var(--color-brand)]"
                    : "text-neutral-500 hover:text-neutral-700",
                ].join(" ")}
              >
                <Icon size={14} className="shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>

                {/* Animated underline indicator */}
                {isActive && (
                  <motion.div
                    layoutId="hub-tab-underline"
                    className="absolute inset-0 rounded-xl bg-[var(--color-brand)]/8"
                    transition={{ duration: 0.22, ease: EASE }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "overview" && <OverviewTab key="overview" data={data} />}
        {activeTab === "timeline" && (
          <motion.div
            key="timeline"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            <GanttPage
              projectName={projectName}
              onBack={() => setActiveTab("overview")}
            />
          </motion.div>
        )}
        {activeTab === "tasks"      && <TasksTab      key="tasks"      data={data} />}
        {activeTab === "risks"      && <RisksTab      key="risks"      data={data} />}
        {activeTab === "costs"      && <CostsTab      key="costs"      data={data} />}
        {activeTab === "meetings"   && <MeetingsTab   key="meetings"   data={data} />}
        {activeTab === "milestones" && <MilestonesTab key="milestones" data={data} />}
      </AnimatePresence>
    </div>
  );
}
