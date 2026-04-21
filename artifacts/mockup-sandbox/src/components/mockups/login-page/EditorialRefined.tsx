import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight, Loader2, Zap, ShieldCheck } from "lucide-react";

const WORDS = ["precision.", "clarity.", "excellence.", "purpose."];

function Typewriter() {
  const [wordIdx, setWordIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = WORDS[wordIdx];
    let t: ReturnType<typeof setTimeout>;
    if (!deleting && chars === word.length) {
      t = setTimeout(() => setDeleting(true), 2600);
    } else if (deleting && chars === 0) {
      setDeleting(false);
      setWordIdx((i) => (i + 1) % WORDS.length);
    } else {
      t = setTimeout(
        () => setChars((c) => (deleting ? c - 1 : c + 1)),
        deleting ? 45 : 85
      );
    }
    return () => clearTimeout(t);
  }, [chars, deleting, wordIdx]);

  return (
    <span className="italic text-stone-400">
      {WORDS[wordIdx].slice(0, chars)}
      <span
        style={{
          display: "inline-block",
          width: "2px",
          height: "1em",
          background: "#a8a29e",
          marginLeft: "2px",
          verticalAlign: "text-bottom",
          animation: "blink 1s step-end infinite",
        }}
      />
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </span>
  );
}

function SlowWatermark() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none"
      aria-hidden
    >
      <div
        style={{
          whiteSpace: "nowrap",
          fontSize: "clamp(64px, 10vw, 140px)",
          fontFamily: "'Playfair Display', serif",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "-0.02em",
          color: "rgb(245 245 244)",
          animation: "scrollLeft 32s linear infinite",
          lineHeight: 1,
        }}
      >
        East Side Studio &nbsp;&nbsp; East Side Studio &nbsp;&nbsp; East Side Studio
      </div>
      <style>{`
        @keyframes scrollLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
}

export function EditorialRefined() {
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1400);
  };

  const panelBase = "transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]";

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-white">
      <SlowWatermark />

      {/* ── Left branding panel ── */}
      <div
        className={`relative z-10 hidden w-[44%] flex-col bg-white/80 backdrop-blur-sm lg:flex ${panelBase}`}
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateX(0)" : "translateX(-16px)",
          borderRight: "1px solid rgb(231 229 228)",
        }}
      >
        {/* Top accent bar */}
        <div className="h-0.5 w-12 bg-stone-900 ml-12 mt-10" />

        <div className="flex flex-1 flex-col justify-between px-12 py-10">
          <img
            src="/__mockup/images/logo.png"
            alt="East Side Studio London"
            className="h-7 w-auto object-contain"
          />

          <div>
            <p
              className="mb-2 text-[10px] font-bold uppercase tracking-[0.35em] text-stone-400"
            >
              Artist Portal
            </p>
            <h1
              style={{ fontFamily: "'Playfair Display', serif" }}
              className="mb-5 text-[2.6rem] font-light leading-[1.12] text-stone-900"
            >
              Where art meets
              <br />
              <Typewriter />
            </h1>
            <p className="max-w-[18rem] text-[13px] leading-[1.7] text-stone-400">
              A private portal for East Side Studio artists. Manage your
              collection, commissions, and financials — all in one place.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />
            <span className="text-[11px] font-medium text-stone-400">
              256-bit encrypted · Invite-only access
            </span>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div
        className={`relative z-10 flex w-full flex-col items-center justify-center bg-white/80 px-8 backdrop-blur-sm lg:w-[56%] lg:px-14 ${panelBase}`}
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(10px)",
          transitionDelay: "80ms",
        }}
      >
        {/* Mobile logo */}
        <div className="mb-8 lg:hidden">
          <img src="/__mockup/images/logo.png" alt="East Side Studio London" className="h-7 w-auto" />
        </div>

        <div className="w-full max-w-[340px]">
          {/* Header */}
          <div className="mb-7">
            <h2 className="mb-0.5 text-[1.2rem] font-semibold tracking-tight text-stone-900">
              Sign in
            </h2>
            <p className="text-[13px] text-stone-400">
              {mode === "signin" ? "Email and password" : "Passwordless sign-in"}
            </p>
          </div>

          {/* Toggle pill */}
          <div
            className="mb-6 inline-flex rounded-full bg-stone-100 p-[3px]"
            style={{ gap: 0 }}
          >
            {(["signin", "magic"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full px-4 py-[7px] text-[11px] font-semibold transition-all duration-200 ${
                  mode === m
                    ? "bg-stone-900 text-white shadow-sm"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {m === "signin" ? "Password" : "Magic Link"}
              </button>
            ))}
          </div>

          {/* Form */}
          {mode === "signin" ? (
            <form onSubmit={submit} className="space-y-3.5">
              <div>
                <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-stone-300" />
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-lg border-stone-200 pl-9 text-[13px] focus-visible:ring-1 focus-visible:ring-stone-400 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                    Password
                  </Label>
                  <button type="button" className="text-[11px] text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline">
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-stone-300" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-lg border-stone-200 pl-9 text-[13px] focus-visible:ring-1 focus-visible:ring-stone-400 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="mt-1 w-full rounded-lg bg-stone-900 text-[13px] font-semibold text-white hover:bg-stone-800 h-10"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Sign In
              </Button>
            </form>
          ) : (
            <div>
              {sent ? (
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-6 py-7 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-stone-200">
                    <Mail className="h-4 w-4 text-stone-600" />
                  </div>
                  <p className="text-[13px] font-semibold text-stone-900">Check your inbox</p>
                  <p className="mt-1 text-[12px] text-stone-400">
                    Sent to <span className="text-stone-600">{email || "your email"}</span>
                  </p>
                  <button onClick={() => setSent(false)} className="mt-4 text-[11px] text-stone-400 hover:text-stone-600 hover:underline">
                    Try again
                  </button>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="space-y-3.5">
                  <div>
                    <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-stone-300" />
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-lg border-stone-200 pl-9 text-[13px]"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full rounded-lg bg-stone-900 text-[13px] font-semibold text-white h-10">
                    <Zap className="mr-2 h-4 w-4" />
                    Send Magic Link
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* Divider + Google */}
          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-100" />
            <span className="text-[11px] text-stone-300">or</span>
            <div className="h-px flex-1 bg-stone-100" />
          </div>
          <Button
            variant="outline"
            className="mt-3.5 w-full rounded-lg border-stone-200 text-[13px] font-medium text-stone-600 hover:bg-stone-50 h-10"
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <p className="mt-7 text-center text-[11px] text-stone-300">
            No account? Contact your studio coordinator.
          </p>
        </div>
      </div>
    </div>
  );
}
