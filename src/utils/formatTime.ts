/** Converts seconds to M:SS display string. e.g. 125 → "2:05" */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Parses a M:SS string to seconds. e.g. "2:05" → 125. Returns null if invalid. */
export function parseTime(value: string): number | null {
  const match = value.match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}
