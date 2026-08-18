"use client";

// Penny Chat: a live voice/text chat with a companion agent, in the browser
// over WebRTC. Single user — the companion greets them by name and carries
// its memory of them from every previous chat.

import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, type Language } from "@elevenlabs/client";
import { LANGUAGE_NAMES, type ChatLanguage, type PersonMemory } from "@/lib/types";

interface Status {
  userName: string;
  language: string;
  accessRequired: boolean;
}

type Turn = { role: "you" | "agent"; text: string };
type Mode = "handsfree" | "ptt" | "text";

const ACCESS_KEY = "pennyAccessCode";

export default function ChatPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [accessCode, setAccessCode] = useState<string>("");
  const [unlocked, setUnlocked] = useState(false);
  const [language, setLanguage] = useState<ChatLanguage>("en");
  const [mode, setMode] = useState<Mode>("handsfree");
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [talking, setTalking] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState<PersonMemory | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const convo = useRef<Conversation | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const activityPing = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const code = localStorage.getItem(ACCESS_KEY);
    return code ? { "x-access-code": code } : {};
  }, []);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: Status) => {
        setStatus(s);
        setLanguage((s.language as ChatLanguage) || "en");
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

  // Push-to-talk: the mic stays closed between turns. Holding opens it and
  // pings "user is active" so the agent won't talk over you; releasing closes
  // it again, which gives the agent clean digital silence to end the turn on.
  const startTalking = useCallback(() => {
    if (!convo.current || phase !== "live") return;
    setTalking(true);
    convo.current.setMicMuted(false);
    convo.current.sendUserActivity();
    activityPing.current ??= setInterval(() => convo.current?.sendUserActivity(), 1500);
  }, [phase]);

  const stopTalking = useCallback(() => {
    if (activityPing.current) {
      clearInterval(activityPing.current);
      activityPing.current = null;
    }
    if (!convo.current) return;
    setTalking(false);
    convo.current.setMicMuted(true);
  }, []);

  // Spacebar as the push-to-talk key.
  useEffect(() => {
    if (phase !== "live" || mode !== "ptt") return;
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      startTalking();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault();
      stopTalking();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [phase, mode, startTalking, stopTalking]);

  // Keep the newest turn in view.
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // Never leave a live session running behind a closed page.
  useEffect(() => {
    return () => {
      if (activityPing.current) clearInterval(activityPing.current);
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
        body: JSON.stringify({ language }),
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
          if (s === "connected") {
            setPhase("live");
            // Push-to-talk starts with the mic closed.
            if (mode === "ptt") {
              convo.current?.setMicMuted(true);
              setTalking(false);
            }
          }
          if (s === "disconnected") setPhase((p) => (p === "idle" ? p : "ended"));
        },
        onModeChange: ({ mode: m }: { mode: string }) => setSpeaking(m === "speaking"),
        onMessage: ({ message, source }: { message: string; source: string }) => {
          if (!message?.trim()) return;
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
  }, [language, mode, authHeaders]);

  async function end() {
    if (activityPing.current) {
      clearInterval(activityPing.current);
      activityPing.current = null;
    }
    await convo.current?.endSession().catch(() => {});
    convo.current = null;
    setPhase("ended");
    setSpeaking(false);
    setTalking(false);
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

  async function eraseMemory() {
    if (!window.confirm("Erase everything your friend remembers? This cannot be undone.")) return;
    await fetch("/api/memory", { method: "DELETE", headers: authHeaders() });
    setMemory(null);
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
      <p className="sub">Your friend is here — and remembers your last chat.</p>

      {phase === "idle" || phase === "ended" ? (
        <div className="panel">
          <h2>{phase === "ended" ? "Chat again?" : `Hi ${name}!`}</h2>
          <label>Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as ChatLanguage)}
          >
            {(Object.keys(LANGUAGE_NAMES) as ChatLanguage[]).map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </select>
          <label>How do you want to chat?</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="handsfree">Hands-free — just talk, like a real call</option>
            <option value="ptt">Push to talk — hold to speak (better in noisy places)</option>
            <option value="text">Text — type and read replies</option>
          </select>
          <button onClick={begin}>💬 Start chatting</button>
          {error && <p className="error">{error}</p>}

          {memory && (
            <div style={{ marginTop: "1.2rem" }}>
              <p className="sub" style={{ marginBottom: "0.3rem" }}>
                <a
                  className="admin-link"
                  onClick={() => setShowMemory((v) => !v)}
                  style={{ cursor: "pointer" }}
                >
                  {showMemory ? "Hide" : "Show"} what your friend remembers (
                  {memory.conversationCount} chat{memory.conversationCount === 1 ? "" : "s"}) →
                </a>
              </p>
              {showMemory && (
                <div className="res-item" style={{ cursor: "default" }}>
                  <p style={{ margin: 0, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>
                    {memory.summary}
                  </p>
                  <button
                    className="secondary"
                    onClick={eraseMemory}
                    style={{ marginTop: "0.6rem" }}
                  >
                    Erase memory
                  </button>
                </div>
              )}
            </div>
          )}
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
                  : mode === "ptt"
                    ? "Hold the button (or the spacebar) and say hello."
                    : mode === "handsfree"
                      ? "Say hello — they can hear you."
                      : "Type a message below to get started."}
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`turn ${t.role === "you" ? "restaurant" : "agent"}`}>
                <div className="who">{t.role === "you" ? "you" : "friend"}</div>
                <div>{t.text}</div>
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

          {mode === "ptt" && phase === "live" && (
            <>
              <button
                type="button"
                className={talking ? "" : "secondary"}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  startTalking();
                }}
                onPointerUp={stopTalking}
                onPointerCancel={stopTalking}
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  width: "100%",
                  marginTop: "0.9rem",
                  minHeight: 64,
                  fontSize: "0.95rem",
                  touchAction: "none",
                  userSelect: "none",
                }}
              >
                {talking ? "🎙 Listening — release to send" : "🎤 Hold to talk"}
              </button>
              <p className="sub" style={{ margin: "0.4rem 0 0", textAlign: "center" }}>
                Or hold the <strong>spacebar</strong>.
              </p>
            </>
          )}

          <div className="row">
            {mode === "handsfree" && phase === "live" && (
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
