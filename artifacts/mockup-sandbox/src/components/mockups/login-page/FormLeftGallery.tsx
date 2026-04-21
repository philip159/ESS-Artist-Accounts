import { useState, useEffect } from "react";
import { Mail, Lock, ArrowRight, Loader2, Zap, ShieldCheck } from "lucide-react";

const SLIDES = [
  {
    src: "/__mockup/images/ess-studio-01.jpg",
    animation: "kbRoom",
    objectPosition: "center center",
    title: "Creator Collaboration",
    caption: "Burcu × East Side Studio",
    year: "2024",
  },
  {
    src: "/__mockup/images/ess-studio-02.jpg",
    animation: "kbWall",
    objectPosition: "center 30%",
    title: "Gallery Wall",
    caption: "Lauren Leely · East Side Studio",
    year: "2024",
  },
  {
    src: "/__mockup/images/ess-studio-03.jpg",
    animation: "kbBedroom",
    objectPosition: "left center",
    title: "At Home with Art",
    caption: "Isamu Noguchi · Studio Collection",
    year: "2023",
  },
];

const KB_CSS = `
  /* Image 1 — colourful room: zoom in gently from wide */
  @keyframes kbRoom {
    0%   { transform: scale(1.0) translate(0%, 0%); }
    100% { transform: scale(1.09) translate(-1.5%, -1%); }
  }
  /* Image 2 — brick wall: pan slowly upward to reveal artwork */
  @keyframes kbWall {
    0%   { transform: scale(1.1) translate(0%, 4%); }
    100% { transform: scale(1.1) translate(0%, -4%); }
  }
  /* Image 3 — bedroom: pan gently right to left */
  @keyframes kbBedroom {
    0%   { transform: scale(1.08) translate(2%, 0%); }
    100% { transform: scale(1.08) translate(-2%, 0%); }
  }
  @keyframes fadeSlide {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

function GalleryPanel() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setActive((i) => (i + 1) % SLIDES.length);
        setVisible(true);
      }, 650);
    }, 5500);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[active];

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#111" }}>
      <style>{KB_CSS}</style>

      {/* Image — Ken Burns */}
      <img
        key={active}
        src={slide.src}
        alt={slide.title}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: slide.objectPosition,
          transformOrigin: "center center",
          animation: `${slide.animation} 6s ease-in-out forwards, fadeSlide 0.65s ease forwards`,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.65s ease",
          willChange: "transform, opacity",
        }}
      />

      {/* Colour wash — very light dark tint so form side doesn't feel disconnected */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "rgba(0,0,0,0.28)" }}
      />

      {/* Bottom gradient — for legible metadata */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: "52%",
          background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.3) 55%, transparent 100%)",
        }}
      />

      {/* Top gradient — for badge */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: "24%",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)",
        }}
      />

      {/* Top: studio badge */}
      <div className="absolute left-7 top-7 z-10">
        <span
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(10px)",
            borderRadius: "999px",
            padding: "5px 14px",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          The Collection
        </span>
      </div>

      {/* Right: slide indicators */}
      <div
        className="absolute right-6 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2"
      >
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => { setActive(i); setVisible(true); }}
            aria-label={`Slide ${i + 1}`}
            style={{
              width: "3px",
              borderRadius: "2px",
              background: i === active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.22)",
              height: i === active ? "22px" : "8px",
              transition: "height 0.3s ease, background 0.3s ease",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          />
        ))}
      </div>

      {/* Bottom: artwork metadata */}
      <div
        className="absolute bottom-7 left-7 right-10 z-10"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.55s ease 0.1s, transform 0.55s ease 0.1s",
        }}
      >
        <p
          style={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
            marginBottom: "4px",
          }}
        >
          {slide.caption} · {slide.year}
        </p>
        <p
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "1.25rem",
            fontWeight: 300,
            lineHeight: 1.2,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          {slide.title}
        </p>
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
          className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-stone-800 outline-none placeholder:text-stone-300 transition-all"
          style={{ boxShadow: "none" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#a8a29e"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(168,162,158,0.12)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>
    </div>
  );
}

export function FormLeftGallery() {
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
    transform: ready ? "none" : "translateY(10px)",
    transition: "opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)",
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {/* ── LEFT: Form panel ── */}
      <div
        className="relative z-10 flex w-full flex-col justify-center overflow-y-auto px-10 py-8 lg:w-[46%]"
        style={{ borderRight: "1px solid #e7e5e4", ...fadeIn }}
      >
        {/* Top accent hairline */}
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
              onSubmit={(e) => {
                e.preventDefault();
                setLoading(true);
                setTimeout(() => setLoading(false), 1400);
              }}
              className="space-y-3.5"
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
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
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
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-5 py-6 text-center">
                  <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-stone-200">
                    <Mail className="h-4 w-4 text-stone-600" />
                  </div>
                  <p className="text-[13px] font-semibold text-stone-900">Check your inbox</p>
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
                  className="space-y-3.5"
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
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-stone-800"
                  >
                    <Zap className="h-4 w-4" />
                    Send Magic Link
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
            <span className="text-[10.5px] text-stone-300">
              256-bit encrypted · Invite-only access
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Gallery panel ── */}
      <div
        className="hidden lg:block lg:w-[54%]"
        style={{
          opacity: ready ? 1 : 0,
          transition: "opacity 0.9s ease",
          transitionDelay: "120ms",
        }}
      >
        <GalleryPanel />
      </div>
    </div>
  );
}
