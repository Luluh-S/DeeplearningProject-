// Pure game logic (no DOM), unit-tested in tests/test_game.mjs.

export const CLASSES = ["Happiness", "Sadness"];

// Arabic display names. The class values above stay unchanged (they are what the API expects).
export const LABEL_AR = { Happiness: "السعادة", Sadness: "الحزن" };
export const labelAr = (label) => LABEL_AR[label] || label;

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
  if (summary.winner === "human") return "الفائز: أنت! عينك سبقت هيا.";
  if (summary.winner === "ai") return "الفائزة: هيا! خمّنت رسومات أكثر هذه المرة.";
  return "تعادل! أنت وهيا على النتيجة نفسها.";
}

export function roundSummary(humanCorrect, aiCorrect) {
  if (humanCorrect && aiCorrect) return "أصبتما كلاكما!";
  if (humanCorrect) return "أنت أصبت، وهيا أخطأت.";
  if (aiCorrect) return "هيا أصابت هذه المرة، وأنت لا.";
  return "لم يُصب أحدٌ منكما الموضوع الحقيقي هذه المرة.";
}

export function formatScore(p) {
  return Number(p).toFixed(3);
}

export const pad2 = (n) => String(n).padStart(2, "0");
