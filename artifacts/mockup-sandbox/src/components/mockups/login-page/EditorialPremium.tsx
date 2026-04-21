import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Lock, ArrowRight, Loader2, Zap, ShieldCheck, Lock as LockIcon } from "lucide-react";

const WORDS = ["precision.", "clarity.", "excellence.", "purpose."];

function Typewriter() {
  const [wordIdx, setWordIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = WORDS[wordIdx];
    let t: ReturnType<typeof setTimeout>;
    if (!deleting && chars === word.length) {
      t = setTimeout(() => setDeleting(true), 2800);
    } else if (deleting && chars === 0) {
      setDeleting(false);
      setWordIdx((i) => (i + 1) % WORDS.length);
    } else {
      t = setTimeout(
        () => setChars((c) => (deleting ? c - 1 : c + 1)),
        deleting ? 42 : 90
      );
    }
    return () => clearTimeout(t);
  }, [chars, deleting, wordIdx]);

  return (
    <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", color: "#a8a29e" }}>
      {WORDS[wordIdx].slice(0, chars)}
      <span
        style={{
          display: "inline-block",
          width: "1.5px",
          height: "0.85em",
          background: "#d6d3d1",
          marginLeft: "1px",
          verticalAlign: "middle",
          animation: "blink 1.1s step-end infinite",
        }}
      />
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </span>
  );
}

/* Subtle diagonal line grid — only on the left panel */
function LinenPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative hidden h-full w-[46%] flex-col overflow-hidden lg:flex"
      style={{ background: "#faf8f5" }}
    >
      {/* Very subtle diagonal lines */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, transparent, transparent 28px, rgba(168,162,158,0.09) 28px, rgba(168,162,158,0.09) 29px)",
        }}
      />
      {/* Right border */}
      <div className="absolute right-0 top-0 h-full w-px bg-stone-200" />
      {children}
    </div>
  );
}

/* Underline-style field */
function Field({
  label,
  icon,
  type,
  placeholder,
  value,
  onChange,
  right,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  right?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label
          className="text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{ color: focused ? "#292524" : "#a8a29e" }}
        >
          {label}
        </label>
        {right}
      </div>
      <div
        className="flex items-center gap-2.5 py-2"
        style={{
          borderBottom: `1.5px solid ${focused ? "#292524" : "#e7e5e4"}`,
          transition: "border-color 0.2s",
        }}
      >
        <span style={{ color: focused ? "#78716c" : "#d6d3d1" }}>{icon}</span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 bg-transparent text-[13px] text-stone-800 outline-none placeholder:text-stone-300"
        />
      </div>
    </div>
  );
}

export function EditorialPremium() {
  const [mode, setMode] = useState<"signin" | "magic">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  const fade = {
    transition: "opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)",
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* ── Left linen panel ── */}
      <LinenPanel>
        <div
          className="relative z-10 flex flex-1 flex-col justify-between p-12"
          style={{
            opacity: ready ? 1 : 0,
            transform: ready ? "none" : "translateX(-14px)",
            ...fade,
          }}
        >
          {/* Logo + year */}
          <div className="flex items-end justify-between">
            <img
              src="/__mockup/images/logo.png"
              alt="East Side Studio London"
              className="h-7 w-auto object-contain"
              style={{ filter: "sepia(0.15) brightness(0.95)" }}
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.25em] text-stone-400"
              style={{ letterSpacing: "0.3em" }}
            >
              Est. 2012
            </span>
          </div>

          {/* Main copy */}
          <div>
            <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.4em] text-stone-400">
              Artist Portal
            </p>
            <h1
              style={{ fontFamily: "'Playfair Display', serif", lineHeight: 1.1 }}
              className="mb-5 text-[3rem] font-light text-stone-900"
            >
              Where art meets
              <br />
              <Typewriter />
            </h1>
            <p className="max-w-[17rem] text-[12.5px] leading-[1.75] text-stone-400">
              A private portal for East Side Studio artists.
              Manage your collection, commissions, and
              financial records securely.
            </p>
          </div>

          {/* Trust */}
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5"
            style={{ background: "rgba(168,162,158,0.08)", width: "fit-content" }}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
            <span className="text-[11px] font-medium text-stone-400">
              End-to-end encrypted
            </span>
          </div>
        </div>
      </LinenPanel>

      {/* ── Right form panel ── */}
      <div
        className="flex w-full flex-col items-center justify-center bg-white px-8 lg:w-[54%] lg:px-14"
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "none" : "translateY(10px)",
          transitionDelay: "90ms",
          ...fade,
        }}
      >
        {/* Mobile logo */}
        <div className="mb-8 lg:hidden">
          <img src="/__mockup/images/logo.png" alt="East Side Studio London" className="h-7 w-auto" />
        </div>

        <div className="w-full max-w-[320px]">
          <div className="mb-8">
            <h2
              className="mb-1 text-[1.15rem] font-semibold tracking-tight text-stone-900"
            >
              Sign in
            </h2>
            <p className="text-[12.5px] text-stone-400">
              {mode === "signin" ? "Use your credentials to continue" : "Get a sign-in link by email"}
            </p>
          </div>

          {/* Tab toggle — underline style */}
          <div className="mb-8 flex border-b border-stone-100">
            {(["signin", "magic"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="relative mr-6 pb-2.5 text-[12px] font-semibold transition-colors"
                style={{ color: mode === m ? "#292524" : "#a8a29e" }}
              >
                {m === "signin" ? "Password" : "Magic Link"}
                {mode === m && (
                  <span
                    className="absolute bottom-[-1px] left-0 h-[1.5px] w-full bg-stone-900"
                    style={{ borderRadius: "2px" }}
                  />
                )}
              </button>
            ))}
          </div>

          {mode === "signin" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setLoading(true);
                setTimeout(() => setLoading(false), 1400);
              }}
              className="space-y-5"
            >
              <Field
                label="Email"
                icon={<Mail size={14} />}
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={setEmail}
              />
              <Field
                label="Password"
                icon={<Lock size={14} />}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={setPassword}
                right={
                  <button
                    type="button"
                    className="text-[10px] font-medium text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
                  >
                    Forgot?
                  </button>
                }
              />
              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Sign In
              </button>
            </form>
          ) : (
            <div>
              {sent ? (
                <div
                  className="rounded-2xl px-6 py-7 text-center"
                  style={{ background: "#faf8f5", border: "1px solid #e7e5e4" }}
                >
                  <div
                    className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
                    style={{ background: "#e7e5e4" }}
                  >
                    <Mail className="h-4 w-4 text-stone-600" />
                  </div>
                  <p className="text-[13px] font-semibold text-stone-800">Check your inbox</p>
                  <p className="mt-1 text-[12px] text-stone-400">
                    Sent to{" "}
                    <span className="text-stone-600">{email || "your email"}</span>
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="mt-4 text-[11px] text-stone-400 hover:text-stone-600 hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => { e.preventDefault(); setSent(true); }}
                  className="space-y-5"
                >
                  <Field
                    label="Email"
                    icon={<Mail size={14} />}
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={setEmail}
                  />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-stone-800"
                  >
                    <Zap className="h-4 w-4" />
                    Send Magic Link
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Google */}
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "#f5f5f4" }} />
            <span className="text-[10px] text-stone-300">or</span>
            <div className="h-px flex-1" style={{ background: "#f5f5f4" }} />
          </div>
          <button
            type="button"
            className="mt-3.5 flex w-full items-center justify-center gap-2.5 rounded-xl border py-2.5 text-[12.5px] font-medium text-stone-600 transition-colors hover:bg-stone-50"
            style={{ borderColor: "#e7e5e4" }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <p className="mt-8 text-center text-[11px] text-stone-300">
            No account? Contact your studio coordinator.
          </p>
        </div>
      </div>
    </div>
  );
}
