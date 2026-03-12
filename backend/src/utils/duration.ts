const DURATION_RE = /^(\d+)([smhd])$/;

export function durationToMilliseconds(value: string): number {
  const match = value.match(DURATION_RE);
  if (!match) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    throw new Error(`Unsupported duration format: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case "s":
      return amount * 1_000;
    case "m":
      return amount * 60_000;
    case "h":
      return amount * 3_600_000;
    case "d":
      return amount * 86_400_000;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}

export function futureIsoDate(duration: string): string {
  const ms = durationToMilliseconds(duration);
  return new Date(Date.now() + ms).toISOString();
}
