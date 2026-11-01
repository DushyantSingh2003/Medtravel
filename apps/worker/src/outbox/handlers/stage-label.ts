/** A stage as words for a message ("medical_review" → "Medical review"). */
export function stageLabel(stage: string): string {
  const words = stage.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
