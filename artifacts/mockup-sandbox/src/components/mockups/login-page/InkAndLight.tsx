import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight, Loader2, Zap, X } from "lucide-react";

function MeshBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base */}
      <div className="absolute inset-0 bg-[#0f0f0f]" />

      {/* Animated colour blobs */}
      <div
        style={{
          position: "absolute",
          width: "900px",
          height: "900px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at center, rgba(120,80,50,0.35) 0%, transparent 65%)",
          top: "-300px",
          left: "-200px",
          animation: "meshA 18s ease-in-out infinite",
          filter: "blur(80px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "700px",
          height: "700px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at center, rgba(60,80,100,0.4) 0%, transparent 65%)",
          bottom: "-200px",
          right: "-150px",
          animation: "meshB 22s ease-in-out infinite",
          filter: "blur(100px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at center, rgba(100,60,80,0.3) 0%, transparent 65%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          animation: "meshC 14s ease-in-out infinite",
          filter: "blur(60px)",
        }}
      />

      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px",
        }}
      />

      <style>{`
        @keyframes meshA {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(80px, 60px) rotate(15deg); }
          66% { transform: translate(-40px, 100px) rotate(-10deg); }
        }
        @keyframes meshB {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(-60px, -80px) rotate(-20deg); }
          66% { transform: translate(50px, -40px) rotate(12deg); }
        }
        @keyframes meshC {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.4); }
        }
      `}</style>
    </div>
  );
}

export function InkAndLight() {
  const [mode, setMode] = useState<"signin" | "magic">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const simulateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1400);
  };

  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden">
      <MeshBackground />

      {/* Glassmorphism card */}
      <div
        className="relative z-10 w-full max-w-md rounded-2xl p-8"
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <img
            src="/__mockup/images/logo.png"
            alt="East Side Studio London"
            className="h-9 w-auto object-contain brightness-0 invert"
          />
        </div>

        <div className="mb-6">
          <h2
            className="mb-1 text-center text-2xl font-light text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Artist Portal
          </h2>
          <p className="text-center text-sm text-white/40">
            Sign in to access your dashboard
          </p>
        </div>

        {/* Tab toggle */}
        <div
          className="mb-6 flex rounded-xl p-1"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
              mode === "signin"
                ? "bg-white/15 text-white shadow-sm"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            Password
          </button>
          <button
            onClick={() => setMode("magic")}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
              mode === "magic"
                ? "bg-white/15 text-white shadow-sm"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            Magic Link
          </button>
        </div>

        {mode === "signin" ? (
          <form onSubmit={simulateSubmit} className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-white/60">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-white/10 bg-white/5 pl-10 text-sm text-white placeholder:text-white/25 focus-visible:ring-white/20"
                />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="text-xs font-medium text-white/60">
                  Password
                </Label>
                <button
                  type="button"
                  className="text-xs text-amber-400/80 hover:text-amber-400"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-white/10 bg-white/5 pl-10 text-sm text-white placeholder:text-white/25 focus-visible:ring-white/20"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-white text-stone-900 hover:bg-white/90"
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
              <div
                className="rounded-xl p-6 text-center"
                style={{ background: "rgba(255,255,255,0.07)" }}
              >
                <div
                  className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  <Mail className="h-5 w-5 text-amber-300" />
                </div>
                <p className="font-medium text-white">Check your inbox</p>
                <p className="mt-1 text-sm text-white/50">
                  Magic link sent to{" "}
                  <span className="text-white/80">{email || "your email"}</span>
                </p>
                <button
                  onClick={() => setSent(false)}
                  className="mt-4 flex items-center gap-1 mx-auto text-xs text-white/40 hover:text-white/60"
                >
                  <X className="h-3 w-3" /> Send again
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
                className="space-y-4"
              >
                <div>
                  <Label className="mb-1.5 block text-xs font-medium text-white/60">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="border-white/10 bg-white/5 pl-10 text-sm text-white placeholder:text-white/25"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-white text-stone-900 hover:bg-white/90"
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Send Magic Link
                </Button>
              </form>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-white/30">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <Button
          variant="outline"
          className="mt-4 w-full border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-xs text-white/25">
          No account? Contact your studio coordinator.
        </p>
      </div>
    </div>
  );
}
