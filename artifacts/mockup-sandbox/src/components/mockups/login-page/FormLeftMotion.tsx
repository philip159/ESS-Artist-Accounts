import { useState, useEffect, useRef } from "react";
import { Mail, Lock, ArrowRight, Loader2, Zap, ShieldCheck } from "lucide-react";

/* ── Animated architectural right panel ── */
function MotionPanel() {
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReveal(true), 200);
    return () => clearTimeout(t);
  }, []);

  /* 14 horizontal lines, each staggered */
  const lineCount = 14;
  const lines = Array.from({ length: lineCount });

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ background: "#faf8f5" }}
    >
      {/* Diagonal subtle texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(120deg, transparent, transparent 48px, rgba(168,162,158,0.07) 48px, rgba(168,162,158,0.07) 49px)",
        }}
      />

      {/* Left border accent */}
      <div className="absolute left-0 top-0 h-full w-px bg-stone-200" />

      {/* Animated horizontal rule lines — draw in from left */}
      <div className="pointer-events-none absolute inset-0">
        {lines.map((_, i) => {
          const topPct = 8 + (i / (lineCount - 1)) * 84;
          const delay = i * 55 + 300;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: "10%",
                top: `${topPct}%`,
                height: "1px",
                background: i % 3 === 0
                  ? "rgba(168,162,158,0.2)"
                  : "rgba(168,162,158,0.1)",
                width: reveal ? (i % 4 === 0 ? "70%" : i % 2 === 0 ? "45%" : "30%") : "0%",
                transition: `width 1.1s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
              }}
            />
          );
        })}
      </div>

      {/* Large slowly rotating circle */}
      <div
        className="pointer-events-none absolute"
        style={{
          width: "420px",
          height: "420px",
          right: "-80px",
          bottom: "-80px",
          borderRadius: "50%",
          border: "1.5px solid rgba(168,162,158,0.2)",
          animation: "slowSpin 40s linear infinite",
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          width: "280px",
          height: "280px",
          right: "-10px",
          bottom: "-10px",
          borderRadius: "50%",
          border: "1px dashed rgba(168,162,158,0.15)",
          animation: "slowSpin 28s linear infinite reverse",
        }}
      />
      <style>{`
        @keyframes slowSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes gentlePulse {
          0%, 100% { opacity: 0.06; }
          50% { opacity: 0.12; }
        }
      `}</style>

      {/* Faint watermark "ESS" monogram — top right */}
      <div
        className="pointer-events-none absolute right-8 top-8"
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "160px",
          fontWeight: 900,
          color: "rgb(214 211 208)",
          lineHeight: 1,
          opacity: reveal ? 0.18 : 0,
          transition: "opacity 1.5s ease 600ms",
          userSelect: "none",
          letterSpacing: "-0.04em",
        }}
      >
        ESS
      </div>

      {/* Content area — centered */}
      <div
        className="relative z-10 flex flex-1 flex-col items-start justify-end p-10"
        style={{
          opacity: reveal ? 1 : 0,
          transform: reveal ? "none" : "translateY(16px)",
          transition: "opacity 1s ease 700ms, transform 1s cubic-bezier(0.16,1,0.3,1) 700ms",
        }}
      >
        {/* Stat cards — horizontal row */}
        <div className="mb-8 flex gap-4">
          {[
            { label: "Artists", value: "48" },
            { label: "Works sold", value: "1.2k" },
            { label: "Est.", value: "2012" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(168,162,158,0.2)",
                backdropFilter: "blur(8px)",
                minWidth: "80px",
              }}
            >
              <p
                className="text-[1.35rem] font-semibold leading-none text-stone-800"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {stat.value}
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.15em] text-stone-400">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Tagline */}
        <div>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.4em] text-stone-400">
            East Side Studio · London
          </p>
          <p
            className="max-w-[22rem] text-[1.4rem] font-light leading-[1.25] text-stone-700"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            A private space for artists who care about what they create.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Shared form field ── */
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
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
          {label}
        </label>
        {right}
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300">{icon}</span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-stone-800 outline-none placeholder:text-stone-300 focus:border-stone-400 focus:ring-1 focus:ring-stone-300 transition-all"
        />
      </div>
    </div>
  );
}

export function FormLeftMotion() {
  const [mode, setMode] = useState<"signin" | "magic">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  const fadeIn = {
    opacity: ready ? 1 : 0,
    transform: ready ? "none" : "translateY(12px)",
    transition: "opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)",
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {/* ── LEFT: Form panel ── */}
      <div
        className="relative z-10 flex w-full flex-col justify-center overflow-y-auto px-10 py-8 lg:w-[46%]"
        style={{ borderRight: "1px solid #e7e5e4", ...fadeIn }}
      >
        {/* Top accent */}
        <div className="absolute left-10 top-8 h-0.5 w-10 bg-stone-900" />

        <div className="mx-auto w-full max-w-[310px]">
          {/* Logo */}
          <img
            src="/__mockup/images/logo.png"
            alt="East Side Studio London"
            className="mb-8 h-6 w-auto object-contain"
          />

          {/* Heading */}
          <div className="mb-7">
            <h2 className="mb-0.5 text-[1.15rem] font-semibold tracking-tight text-stone-900">
              Sign in
            </h2>
            <p className="text-[12.5px] text-stone-400">
              {mode === "signin" ? "Email and password" : "Passwordless sign-in"}
            </p>
          </div>

          {/* Pill toggle */}
          <div className="mb-6 inline-flex rounded-full bg-stone-100 p-[3px]">
            {(["signin", "magic"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="rounded-full px-4 py-[7px] text-[11px] font-semibold transition-all duration-200"
                style={{
                  background: mode === m ? "#1c1917" : "transparent",
                  color: mode === m ? "#fff" : "#78716c",
                  boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                }}
              >
                {m === "signin" ? "Password" : "Magic Link"}
              </button>
            ))}
          </div>

          {/* Form */}
          {mode === "signin" ? (
            <form
              onSubmit={(e) => { e.preventDefault(); setLoading(true); setTimeout(() => setLoading(false), 1400); }}
              className="space-y-3.5"
            >
              <Field label="Email" icon={<Mail size={14} />} type="email" placeholder="your@email.com" value={email} onChange={setEmail} />
              <Field
                label="Password"
                icon={<Lock size={14} />}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={setPassword}
                right={
                  <button type="button" className="text-[10px] font-medium text-stone-400 hover:text-stone-600 hover:underline underline-offset-2">
                    Forgot?
                  </button>
                }
              />
              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Sign In
              </button>
            </form>
          ) : (
            <div>
              {sent ? (
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-5 py-6 text-center">
                  <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-stone-200">
                    <Mail className="h-4 w-4 text-stone-600" />
                  </div>
                  <p className="text-[13px] font-semibold text-stone-900">Check your inbox</p>
                  <p className="mt-1 text-[12px] text-stone-400">
                    Sent to <span className="text-stone-600">{email || "your email"}</span>
                  </p>
                  <button onClick={() => setSent(false)} className="mt-4 text-[11px] text-stone-400 hover:text-stone-600 hover:underline">Try again</button>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="space-y-3.5">
                  <Field label="Email" icon={<Mail size={14} />} type="email" placeholder="your@email.com" value={email} onChange={setEmail} />
                  <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white hover:bg-stone-800 transition-colors">
                    <Zap className="h-4 w-4" /> Send Magic Link
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Divider + Google */}
          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-100" />
            <span className="text-[10px] text-stone-300">or</span>
            <div className="h-px flex-1 bg-stone-100" />
          </div>
          <button
            type="button"
            className="mt-3.5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-stone-200 py-2.5 text-[12.5px] font-medium text-stone-600 transition-colors hover:bg-stone-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="mt-6 flex items-center gap-2">
            <ShieldCheck className="h-3 w-3 text-emerald-500" strokeWidth={2.5} />
            <span className="text-[10.5px] text-stone-300">256-bit encrypted · Invite-only access</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Motion Lines panel ── */}
      <div
        className="hidden lg:block lg:w-[54%]"
        style={{
          opacity: ready ? 1 : 0,
          transition: "opacity 0.9s cubic-bezier(0.16,1,0.3,1)",
          transitionDelay: "100ms",
        }}
      >
        <MotionPanel />
      </div>
    </div>
  );
}
