// Pure game logic (no DOM), unit-tested in tests/test_game.mjs.

export const CLASSES = ["Happiness", "Sadness"];

/**
 * Summarise a finished game.
 * @param {{humanCorrect: boolean, aiCorrect: boolean}[]} rounds
 */
export function summarize(rounds) {
  const total = rounds.length;
  let human = 0, ai = 0, both = 0, onlyHuman = 0, onlyAI = 0, neither = 0;
  for (const r of rounds) {
    if (r.humanCorrect) human++;
    if (r.aiCorrect) ai++;
    if (r.humanCorrect && r.aiCorrect) both++;
    else if (r.humanCorrect) onlyHuman++;
    else if (r.aiCorrect) onlyAI++;
    else neither++;
  }
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const winner = human > ai ? "human" : ai > human ? "ai" : "tie";
  return { total, human, ai, both, onlyHuman, onlyAI, neither, humanAcc: pct(human), aiAcc: pct(ai), winner };
}

export function winnerMessage(summary) {
  if (summary.winner === "human") return "Winner: Human. Your eye beat the machine.";
  if (summary.winner === "ai") return "Winner: Machine. The model read more drawings correctly.";
  return "It's a tie. Human and machine finished level.";
}

export function roundSummary(humanCorrect, aiCorrect) {
  if (humanCorrect && aiCorrect) return "You both read it correctly.";
  if (humanCorrect) return "You saw it, the machine missed.";
  if (aiCorrect) return "The machine got this one, you didn't.";
  return "Neither of you matched the original label.";
}

export function formatScore(p) {
  return Number(p).toFixed(3);
}

export const pad2 = (n) => String(n).padStart(2, "0");
