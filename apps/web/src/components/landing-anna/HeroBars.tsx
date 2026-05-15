"use client";

import { useEffect, useRef } from "react";

const ROWS = 5;
const BARS_PER_ROW = 5;
const SHADES = ["shade-1", "shade-2", "shade-3", "shade-4"];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function makeBar(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "bar";
  const shade = SHADES[Math.floor(Math.random() * SHADES.length)];
  el.classList.add(shade);
  if (Math.random() < 0.33) el.classList.add("fade");
  el.style.flex = `0 0 ${Math.round(rand(120, 320))}px`;
  return el;
}

export function HeroBars() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    // Stop StrictMode double-mount from doubling the rows.
    if (stage.dataset.hydrated === "1") return;
    stage.dataset.hydrated = "1";

    const rows: HTMLDivElement[] = [];
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement("div");
      row.className = "bars-row";
      for (let i = 0; i < BARS_PER_ROW; i++) row.appendChild(makeBar());
      stage.appendChild(row);
      rows.push(row);
    }

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return () => undefined;

    const handle = window.setInterval(() => {
      if (document.hidden) return;
      const row = rows[Math.floor(Math.random() * rows.length)];
      const bars = Array.from(row.children) as HTMLElement[];
      if (!bars.length) return;
      const old = bars[Math.floor(Math.random() * bars.length)];
      old.classList.add("leaving");
      window.setTimeout(() => {
        const fresh = makeBar();
        fresh.style.opacity = "0";
        fresh.style.transform = "translateX(-24px) scaleX(0.7)";
        row.replaceChild(fresh, old);
        window.setTimeout(() => {
          fresh.style.opacity = "";
          fresh.style.transform = "";
        }, 32);
      }, 620);
    }, 1500);

    return () => {
      window.clearInterval(handle);
      delete stage.dataset.hydrated;
      while (stage.firstChild) stage.removeChild(stage.firstChild);
    };
  }, []);

  return <div ref={stageRef} className="bars-stage" aria-hidden="true" />;
}
