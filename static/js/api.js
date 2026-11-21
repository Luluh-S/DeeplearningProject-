// Thin wrapper around the backend API.

// Arabic versions of the server's English messages. The backend is unchanged;
// messages are translated here for display only (unknown messages pass through).
const SERVER_MESSAGES_AR = [
  [/^This game session has expired\. Please start a new challenge\.$/, "انتهت صلاحية جلسة اللعب. يُرجى بدء تحدٍّ جديد."],
  [/^Please choose Happiness or Sadness\.$/, "يُرجى اختيار السعادة أو الحزن."],
  [/^This artwork is not part of your game\.$/, "هذه الرسمة ليست جزءاً من لعبتك."],
  [/^This round has already been answered\.$/, "تمت الإجابة عن هذه الجولة بالفعل."],
  [/^Artwork not found\.$/, "لم يتم العثور على الرسمة."],
  [/^The gallery is empty\.$/, "المعرض فارغ."],
  [/^The gallery manifest lists no available images\.$/, "لا توجد صور متاحة في ملف المعرض."],
  [/^Gallery manifest not found\./, "لم يتم العثور على ملف المعرض (manifest). شغّل scripts/build_gallery.py (راجع README)."],
  [/^The AI is not available:/, "هيا غير متاحة الآن: النموذج غير محمَّل ولا يوجد تنبؤ مخزَّن لهذه الرسمة. راجع README ← 'Connect the model'."],
  [/^The AI Art Studio needs the live model/, "يحتاج مرسم هيا إلى النموذج الحي، وهو غير محمَّل على هذا الخادم."],
  [/^File is larger than (\d+) MB\.$/, "حجم الملف أكبر من $1 ميغابايت."],
  [/^The file is empty\.$/, "الملف فارغ."],
  [/^This file is not a readable image\.$/, "هذا الملف ليس صورة قابلة للقراءة."],
  [/^Unsupported image format \((.*)\)\. Use PNG, JPEG or WEBP\.$/, "صيغة الصورة غير مدعومة ($1). استخدم PNG أو JPEG أو WEBP."],
  [/^The image is too large\. Please use a smaller picture\.$/, "الصورة كبيرة جداً. يُرجى استخدام صورة أصغر."],
  [/^The image is too small to analyse\.$/, "الصورة صغيرة جداً على التحليل."],
  [/^This image could not be decoded\.$/, "تعذّرت قراءة هذه الصورة."],
  [/^Model file not found/, "لم يتم العثور على ملف النموذج. راجع README ← 'Connect the model'."],
  [/^The model is not loaded\.$/, "النموذج غير محمَّل."],
];
export function translateServerMessage(message) {
  if (typeof message !== "string") return message;
  for (const [re, ar] of SERVER_MESSAGES_AR) if (re.test(message)) return message.replace(re, ar);
  return message;
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, headers: { Accept: "application/json", ...(options.headers || {}) } });
  } catch {
    throw new Error("تعذّر الوصول إلى الخادم. تحقّق من الاتصال وحاول مجدداً.");
  }
  let data = null;
  try { data = await response.json(); } catch { /* non-JSON body */ }
  if (!response.ok) {
    const message = (data && (data.error || data.detail)) || `فشل الطلب (${response.status}).`;
    const err = new Error(typeof message === "string" ? translateServerMessage(message) : "فشل الطلب.");
    err.status = response.status;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request("/api/health"),
  newSession: () => request("/api/gallery/session", { method: "POST" }),
  reveal: (sessionId, artworkId, humanChoice) =>
    request("/api/gallery/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, artwork_id: artworkId, human_choice: humanChoice }),
    }),
  predict: (blob, filename = "drawing.png") => {
    const form = new FormData();
    form.append("file", blob, filename);
    return request("/api/predict", { method: "POST", body: form });
  },
};
