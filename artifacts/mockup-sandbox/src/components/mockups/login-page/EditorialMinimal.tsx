import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight, Loader2, Zap } from "lucide-react";

function TypewriterText({
  words,
  className,
}: {
  words: string[];
  className?: string;
}) {
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    const current = words[wordIdx];
    const speed = deleting ? 50 : 90;
    const pause = 2200;

    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && charIdx === current.length) {
      timeout = setTimeout(() => setDeleting(true), pause);
    } else if (deleting && charIdx === 0) {
      setDeleting(false);
      setWordIdx((i) => (i + 1) % words.length);
    } else {
      timeout = setTimeout(() => {
        setCharIdx((i) => (deleting ? i - 1 : i + 1));
        setDisplayed(current.slice(0, deleting ? charIdx - 1 : charIdx + 1));
      }, speed);
    }

    return () => clearTimeout(timeout);
  }, [charIdx, deleting, wordIdx, words]);

  return (
    <span className={className}>
      {displayed}
      <span className="animate-pulse">|</span>
    </span>
  );
}

function WatermarkText() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none"
      aria-hidden
    >
      <div
        className="whitespace-nowrap text-[clamp(80px,14vw,180px)] font-black uppercase leading-none text-stone-100"
        style={{
          fontFamily: "'Playfair Display', serif",
          letterSpacing: "-0.02em",
          animation: "slideWatermark 20s linear infinite",
        }}
      >
        East Side Studio &nbsp; East Side Studio &nbsp; East Side Studio
      </div>
      <style>{`
        @keyframes slideWatermark {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
}

export function EditorialMinimal() {
  const [mode, setMode] = useState<"signin" | "magic">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const simulateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1400);
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-white">
      <WatermarkText />

      {/* Left column: branding */}
      <div
        className="relative z-10 hidden w-[45%] flex-col justify-between border-r border-stone-100 bg-white/70 p-14 backdrop-blur-sm lg:flex"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateX(0)" : "translateX(-20px)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}
      >
        <img
          src="/__mockup/images/logo.png"
          alt="East Side Studio London"
          className="h-8 w-auto object-contain"
        />

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-stone-400">
            Artist Portal
          </p>
          <h1
            className="mb-5 text-4xl font-light leading-[1.15] text-stone-900"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Where art meets{" "}
            <span className="italic text-stone-500">
              <TypewriterText
                words={["precision.", "clarity.", "excellence.", "trust."]}
              />
            </span>
          </h1>
          <p className="max-w-xs text-sm leading-relaxed text-stone-400">
            A private portal for East Side Studio artists. Manage your
            collection, commissions, and payments securely.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-stone-400">Secure & encrypted</span>
        </div>
      </div>

      {/* Right column: form */}
      <div
        className="relative z-10 flex w-full flex-col items-center justify-center bg-white/80 px-8 backdrop-blur-sm lg:w-[55%] lg:px-16"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s",
        }}
      >
        {/* Mobile logo */}
        <div className="mb-8 lg:hidden">
          <img
            src="/__mockup/images/logo.png"
            alt="East Side Studio London"
            className="h-8 w-auto object-contain"
          />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h2 className="mb-0.5 text-xl font-semibold text-stone-900">
              Sign in
            </h2>
            <p className="text-sm text-stone-400">
              {mode === "signin"
                ? "Use your email and password"
                : "Get a secure link by email"}
            </p>
          </div>

          {/* Pill toggle */}
          <div className="mb-6 inline-flex rounded-full border border-stone-200 bg-stone-50 p-0.5">
            <button
              onClick={() => setMode("signin")}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                mode === "signin"
                  ? "bg-stone-900 text-white shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              Password
            </button>
            <button
              onClick={() => setMode("magic")}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                mode === "magic"
                  ? "bg-stone-900 text-white shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              Magic Link
            </button>
          </div>

          {mode === "signin" ? (
            <form onSubmit={simulateSubmit} className="space-y-3">
              <div>
                <Label className="mb-1 block text-xs text-stone-500">
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300" />
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-xl border-stone-200 pl-10 text-sm focus-visible:ring-stone-300"
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-xs text-stone-500">Password</Label>
                  <button
                    type="button"
                    className="text-xs text-stone-400 underline-offset-2 hover:underline"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-xl border-stone-200 pl-10 text-sm focus-visible:ring-stone-300"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="mt-1 w-full rounded-xl bg-stone-900 text-white hover:bg-stone-800"
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
                <div className="rounded-2xl border border-stone-100 bg-stone-50 p-6 text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-stone-200">
                    <Mail className="h-5 w-5 text-stone-600" />
                  </div>
                  <p className="text-sm font-medium text-stone-900">
                    Check your inbox
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    Sent to{" "}
                    <strong className="text-stone-600">
                      {email || "your email"}
                    </strong>
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="mt-4 text-xs text-stone-400 hover:text-stone-600 hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSent(true);
                  }}
                  className="space-y-3"
                >
                  <div>
                    <Label className="mb-1 block text-xs text-stone-500">
                      Email address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300" />
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-xl border-stone-200 pl-10 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full rounded-xl bg-stone-900 text-white hover:bg-stone-800"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Send Magic Link
                  </Button>
                </form>
              )}
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-100" />
            <span className="text-xs text-stone-300">or</span>
            <div className="h-px flex-1 bg-stone-100" />
          </div>

          <Button
            variant="outline"
            className="mt-4 w-full rounded-xl border-stone-200 text-stone-600 hover:bg-stone-50"
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <p className="mt-7 text-center text-xs text-stone-300">
            No account? Contact your studio coordinator.
          </p>
        </div>
      </div>
    </div>
  );
}
