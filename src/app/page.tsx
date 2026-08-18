"use client";

// Penny Chat: a live voice/text chat with a companion agent, in the browser
// over WebRTC. Single user — the companion greets them by name and carries
// its memory of them from every previous chat.

import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, type Language } from "@elevenlabs/client";
import { type PersonMemory } from "@/lib/types";

interface Status {
  userName: string;
  accessRequired: boolean;
}

type Turn = { role: "you" | "agent"; text: string; imageUrl?: string };
type Mode = "voice" | "text";

const ACCESS_KEY = "pennyAccessCode";

// Marks a user message that carries a photo description (see /api/photo).
// The session prompt tells the agent to react to these as pictures; the
// transcript hides them because the thumbnail turn is already shown.
const PHOTO_TAG = "[PHOTO]";

// Downscale a photo in the browser so the upload stays small (and Claude
// vision cheap) — phone camera images are far bigger than needed.
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That photo format didn't work — try a JPG or PNG.");
  });
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read the photo.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

export default function ChatPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [accessCode, setAccessCode] = useState<string>("");
  const [unlocked, setUnlocked] = useState(false);
  const [mode, setMode] = useState<Mode>("voice");
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState("");
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState<PersonMemory | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [editingMemory, setEditingMemory] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const convo = useRef<Conversation | null>(null);
  const photoInput = useRef<HTMLInputElement | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const code = localStorage.getItem(ACCESS_KEY);
    return code ? { "x-access-code": code } : {};
  }, []);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: Status) => {
        setStatus(s);
        if (!s.accessRequired || localStorage.getItem(ACCESS_KEY)) setUnlocked(true);
      })
      .catch(() => setUnlocked(true));
  }, []);

  const loadMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/memory", { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) setMemory(data.memory ?? null);
    } catch {
      /* transient */
    }
  }, [authHeaders]);

  useEffect(() => {
    if (unlocked) loadMemory();
  }, [unlocked, loadMemory]);

  // Keep the newest turn in view.
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // Never leave a live session running behind a closed page.
  useEffect(() => {
    return () => {
      convo.current?.endSession().catch(() => {});
      convo.current = null;
    };
  }, []);

  function unlock() {
    if (!accessCode.trim()) return;
    localStorage.setItem(ACCESS_KEY, accessCode.trim());
    setAccessCode("");
    setUnlocked(true);
  }

  const begin = useCallback(async () => {
    setError(null);
    setPhase("connecting");
    setTurns([]);
    try {
      const res = await fetch("/api/chat/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.status === 401) {
        localStorage.removeItem(ACCESS_KEY);
        setUnlocked(false);
        throw new Error("That access code didn't work — try again.");
      }
      if (!res.ok) throw new Error(data.error || `Could not start the chat (${res.status})`);

      const textOnly = mode === "text";
      const session = (overrides: Record<string, unknown>) => ({
        conversationToken: data.token as string,
        connectionType: "webrtc" as const,
        dynamicVariables: data.dynamicVariables as Record<string, string>,
        overrides,
        textOnly,
        onStatusChange: ({ status: s }: { status: string }) => {
          if (s === "connected") setPhase("live");
          if (s === "disconnected") setPhase((p) => (p === "idle" ? p : "ended"));
        },
        onModeChange: ({ mode: m }: { mode: string }) => setSpeaking(m === "speaking"),
        onMessage: ({ message, source }: { message: string; source: string }) => {
          if (!message?.trim()) return;
          // Photo-description messages echo back as user turns; the photo
          // itself is already in the transcript, so skip the text.
          if (source === "user" && message.startsWith(PHOTO_TAG)) return;
          setTurns((t) => [...t, { role: source === "user" ? "you" : "agent", text: message }]);
        },
        onError: (msg: string) => setError(msg),
      });

      const lang = data.language as Language;
      try {
        // Lean chat prompt = far less to process before the first word.
        convo.current = await Conversation.startSession(
          session({
            agent: {
              language: lang,
              prompt: {
                prompt: data.chatPrompt as string,
                ...(data.chatLlm ? { llm: data.chatLlm as string } : {}),
              },
              firstMessage: data.firstMessage as string,
            },
          }),
        );
      } catch (overrideErr) {
        // The agent may not permit prompt/first-message overrides — fall back
        // to its dashboard prompt rather than failing the chat.
        console.warn("Prompt override rejected, retrying without it:", overrideErr);
        convo.current = await Conversation.startSession(session({ agent: { language: lang } }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /permission|denied|NotAllowed/i.test(msg)
          ? "Microphone access was denied — allow it, or switch to text chat."
          : msg,
      );
      setPhase("idle");
    }
  }, [mode, authHeaders]);

  async function end() {
    await convo.current?.endSession().catch(() => {});
    convo.current = null;
    setPhase("ended");
    setSpeaking(false);
    // The webhook rewrites memory shortly after the chat ends.
    setTimeout(loadMemory, 8000);
  }

  function toggleMute() {
    const next = !muted;
    convo.current?.setMicMuted(next);
    setMuted(next);
  }

  function sendTyped() {
    const text = typed.trim();
    if (!text || !convo.current) return;
    convo.current.sendUserMessage(text);
    setTyped("");
  }

  // Share a photo: downscale it, have the server describe it (Claude vision),
  // then hand the description to the agent as a tagged user message so it can
  // react as if it saw the picture. Works in voice and text modes alike.
  const sendPhoto = useCallback(
    async (file: File) => {
      if (!convo.current || sendingPhoto) return;
      setError(null);
      setSendingPhoto(true);
      try {
        const dataUrl = await shrinkPhoto(file);
        setTurns((t) => [...t, { role: "you", text: "", imageUrl: dataUrl }]);
        const res = await fetch("/api/photo", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ image: dataUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not send the photo");
        convo.current?.sendUserMessage(`${PHOTO_TAG} ${data.description}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSendingPhoto(false);
      }
    },
    [authHeaders, sendingPhoto],
  );

  async function eraseMemory() {
    if (!window.confirm("Erase everything your bestie remembers? This cannot be undone.")) return;
    await fetch("/api/memory", { method: "DELETE", headers: authHeaders() });
    setMemory(null);
    setShowMemory(false);
  }

  function startEditMemory() {
    setMemoryDraft(memory?.summary ?? "");
    setEditingMemory(true);
    setShowMemory(true);
  }

  // Seed or correct the memory file by hand — the post-chat rewrites fold
  // future conversations into whatever is saved here.
  async function saveMemoryEdit() {
    const summary = memoryDraft.trim();
    if (!summary) return;
    setError(null);
    const res = await fetch("/api/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ summary }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not save the memory");
      return;
    }
    setEditingMemory(false);
    await loadMemory();
  }

  const name = status?.userName ?? "there";

  if (status?.accessRequired && !unlocked) {
    return (
      <main style={{ maxWidth: 560 }}>
        <h1>
          Penny <em>Chat</em>
        </h1>
        <div className="panel">
          <h2>Hi {name}!</h2>
          <p className="sub">Enter your code to start chatting.</p>
          <input
            type="password"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            placeholder="Access code"
          />
          <button onClick={unlock}>Let me in</button>
          {error && <p className="error">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640 }}>
      <h1>
        Penny <em>Chat</em>
      </h1>
      <p className="sub">Your bestie is here — talk, type, or send pics. She remembers everything, no cap.</p>

      {phase === "idle" || phase === "ended" ? (
        <div className="panel">
          <h2>{phase === "ended" ? "Chat again?" : `Hi ${name}!`}</h2>
          <label>How do you want to chat?</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="voice">Voice — just talk, like a real call</option>
            <option value="text">Text — type and read replies</option>
          </select>
          <button onClick={begin}>💬 Start chatting</button>
          {error && <p className="error">{error}</p>}

          <div style={{ marginTop: "1.2rem" }}>
            <p className="sub" style={{ marginBottom: "0.3rem" }}>
              <a
                className="admin-link"
                onClick={() => (memory ? setShowMemory((v) => !v) : startEditMemory())}
                style={{ cursor: "pointer" }}
              >
                {memory
                  ? `${showMemory ? "Hide" : "Show"} what your bestie remembers (${memory.conversationCount} chat${memory.conversationCount === 1 ? "" : "s"}) →`
                  : `Teach your bestie about ${name} →`}
              </a>
            </p>
            {showMemory && (
              <div className="res-item" style={{ cursor: "default" }}>
                {editingMemory ? (
                  <>
                    <textarea
                      value={memoryDraft}
                      onChange={(e) => setMemoryDraft(e.target.value)}
                      rows={10}
                      maxLength={4000}
                      placeholder={`Plain facts your bestie should know, e.g. "${name} is 12 and loves…" (about 300 words)`}
                      style={{ fontSize: "0.9rem" }}
                    />
                    <div className="row">
                      <button
                        className="secondary"
                        onClick={() => {
                          setEditingMemory(false);
                          if (!memory) setShowMemory(false);
                        }}
                        style={{ marginTop: "0.6rem" }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveMemoryEdit}
                        disabled={!memoryDraft.trim()}
                        style={{ marginTop: "0.6rem" }}
                      >
                        Save memory
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>
                      {memory?.summary}
                    </p>
                    <div className="row">
                      <button
                        className="secondary"
                        onClick={startEditMemory}
                        style={{ marginTop: "0.6rem" }}
                      >
                        Edit
                      </button>
                      <button
                        className="secondary"
                        onClick={eraseMemory}
                        style={{ marginTop: "0.6rem" }}
                      >
                        Erase memory
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
            <h2 style={{ margin: 0 }}>
              {phase === "connecting" ? "Connecting…" : "Chatting"}{" "}
              {phase === "live" && (
                <span className={`badge ${speaking ? "calling" : "ok"}`}>
                  {speaking ? "speaking" : "listening"}
                </span>
              )}
            </h2>
            <button
              className="delete-btn"
              title="End chat"
              onClick={end}
              style={{ fontSize: "1.15rem", color: "var(--muted)", flexShrink: 0 }}
            >
              ✕
            </button>
          </div>

          <div className="transcript" style={{ marginTop: "0.8rem" }}>
            {turns.length === 0 && (
              <p className="sub">
                {phase === "connecting"
                  ? "Setting up the connection…"
                  : mode === "voice"
                    ? "Say hi — she can hear you!"
                    : "Type a message below to get started."}
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`turn ${t.role === "you" ? "restaurant" : "agent"}`}>
                <div className="who">{t.role === "you" ? "you" : "bestie"}</div>
                {t.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.imageUrl}
                    alt="Photo you shared"
                    style={{ display: "block", width: 220, maxWidth: "100%", borderRadius: 8 }}
                  />
                ) : (
                  <div>{t.text}</div>
                )}
              </div>
            ))}
            <div ref={transcriptEnd} />
          </div>

          {mode === "text" && phase === "live" && (
            <div className="row" style={{ marginTop: "0.8rem", flexWrap: "nowrap" }}>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendTyped()}
                placeholder="Type a message…"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                onClick={sendTyped}
                style={{ marginTop: 0, flexShrink: 0 }}
                disabled={!typed.trim()}
              >
                Send
              </button>
            </div>
          )}

          <div className="row">
            {phase === "live" && (
              <>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) sendPhoto(file);
                  }}
                />
                <button
                  className="secondary"
                  onClick={() => photoInput.current?.click()}
                  disabled={sendingPhoto}
                >
                  {sendingPhoto ? "📷 Sending…" : "📷 Send a pic"}
                </button>
              </>
            )}
            {mode === "voice" && phase === "live" && (
              <button className="secondary" onClick={toggleMute}>
                {muted ? "🔇 Unmute" : "🎙 Mute"}
              </button>
            )}
            <button className="danger" onClick={end}>
              End chat
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </main>
  );
}
