// Thin wrapper around the backend API.

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, headers: { Accept: "application/json", ...(options.headers || {}) } });
  } catch {
    throw new Error("Can't reach the server. Check the connection and try again.");
  }
  let data = null;
  try { data = await response.json(); } catch { /* non-JSON body */ }
  if (!response.ok) {
    const message = (data && (data.error || data.detail)) || `Request failed (${response.status}).`;
    const err = new Error(typeof message === "string" ? message : "Request failed.");
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
