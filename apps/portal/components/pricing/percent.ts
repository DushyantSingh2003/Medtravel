/** Basis points (1 % = 100) as the text an admin types: `1550` is `15.5`. */
export const percentFromBp = (bp: number): string => {
  const whole = Math.floor(bp / 100);
  const rest = bp % 100;
  if (rest === 0) return String(whole);
  return `${whole}.${String(rest).padStart(2, '0').replace(/0$/, '')}`;
};

/** The reverse, rounded to a whole basis point; null when the text is not a percentage with at most two decimals. */
export const bpFromPercent = (text: string): number | null => {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || 0);
};
