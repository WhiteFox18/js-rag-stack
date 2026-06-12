export function parseDurationMs(value: string): number {
  const match = /^(\d+)([dhm])$/.exec(value);

  if (!match) {
    throw new Error(`Unsupported duration: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
  return amount * unitMs;
}

export function parseDurationSeconds(value: string): number {
  return Math.floor(parseDurationMs(value) / 1_000);
}
