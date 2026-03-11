"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const TARGET = new Date("2026-03-31T23:59:00");

function getTimeLeft() {
  const diff = TARGET.getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours:   Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  const display = String(value).padStart(2, "0");
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.span
        key={display}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="tabular-nums text-[4rem] font-bold leading-none tracking-[-0.04em] text-neutral-900 sm:text-[6rem] md:text-[7.5rem]"
      >
        {display}
      </motion.span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400 sm:text-xs">
        {label}
      </span>
    </div>
  );
}

export function Countdown() {
  const [time, setTime] = useState(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-6 sm:gap-10 md:gap-14">
      <Unit value={time.days}    label="Days"    />
      <Separator />
      <Unit value={time.hours}   label="Hours"   />
      <Separator />
      <Unit value={time.minutes} label="Minutes" />
      <Separator />
      <Unit value={time.seconds} label="Seconds" />
    </div>
  );
}

function Separator() {
  return (
    <span className="mb-8 text-[3rem] font-light text-neutral-300 sm:text-[5rem] md:text-[6rem]">
      :
    </span>
  );
}
