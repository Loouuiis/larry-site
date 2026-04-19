"use client";

import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/FadeUp";
import {
  Waypoints,
  Database,
  Link2,
  Zap,
  BrainCircuit,
  type LucideIcon,
} from "lucide-react";

interface MissionCard {
  icon: LucideIcon;
  title: string;
  body: string;
}

const CARDS: MissionCard[] = [
  {
    icon: Waypoints,
    title: "Alignment",
    body: "Aligns stakeholders, timelines, and work across fragmented systems, tools, and individuals.",
  },
  {
    icon: Database,
    title: "Source of Truth",
    body: "Creates a real-time, single source of truth for all work.",
  },
  {
    icon: Link2,
    title: "Coordination",
    body: "Eliminates manual coordination and constant status chasing.",
  },
  {
    icon: Zap,
    title: "Autonomous Execution",
    body: "Automatically executes actions end-to-end.",
  },
  {
    icon: BrainCircuit,
    title: "Project Context",
    body: "Maintains full project knowledge and delivers instant responses.",
  },
];

export function MissionSection() {
  return (
    <section
      id="mission"
      className="py-12 sm:py-24 bg-white border-t border-[var(--border)]"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-disabled)] uppercase text-center">
            What Larry Does
          </p>
          <h2
            className="mt-4 text-center text-[var(--text-1)] font-bold mx-auto max-w-4xl"
            style={{
              fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            Making projects run themselves by aligning stakeholders, timelines,
            and work through autonomous execution — so teams focus on outcomes,
            not updates.
          </h2>
        </FadeUp>

        <StaggerContainer
          className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5"
          stagger={0.09}
        >
          {CARDS.map((card) => (
            <StaggerItem key={card.title}>
              <MissionCardTile {...card} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}

function MissionCardTile({ icon: Icon, title, body }: MissionCard) {
  return (
    <div className="group h-full rounded-xl border border-[var(--border)] bg-white p-6 transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(17,23,44,0.06)]">
      <div
        className="h-8 w-8 rounded-lg grid place-items-center transition-transform duration-200 group-hover:scale-110"
        style={{ background: "rgba(108,68,246,0.08)" }}
      >
        <Icon size={18} className="text-[#6c44f6]" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-[var(--text-1)]">
        {title}
      </h3>
      <p className="mt-2 text-[13px] text-[var(--text-2)] leading-[1.5]">
        {body}
      </p>
    </div>
  );
}
