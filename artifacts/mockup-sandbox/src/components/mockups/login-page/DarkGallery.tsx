import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Mail, Lock, ArrowRight, Loader2, Zap } from "lucide-react";

function AnimatedPanel() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-stone-950">
      {/* Animated gradient blobs */}
      <div
        className="absolute rounded-full opacity-20"
        style={{
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, #b45309, transparent 70%)",
          top: "-100px",
          left: "-100px",
          animation: "float1 12s ease-in-out infinite",
        }}
      />
      <div
        className="absolute rounded-full opacity-15"
        style={{
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, #78716c, transparent 70%)",
          bottom: "-50px",
          right: "-80px",
          animation: "float2 15s ease-in-out infinite",
        }}
      />
      <div
        className="absolute rounded-full opacity-10"
        style={{
          width: "300px",
          height: "300px",
          background: "radial-gradient(circle, #d97706, transparent 70%)",
          top: "40%",
          left: "40%",
          animation: "float3 10s ease-in-out infinite",
        }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col justify-between p-12">
        <img
          src="/__mockup/images/logo.png"
          alt="East Side Studio London"
          className="h-8 w-auto object-contain brightness-0 invert"
        />

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-amber-500/80">
            Artist Portal
          </p>
          <h1
            className="mb-6 text-5xl font-light leading-tight text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Your work,
            <br />
            <span className="italic text-amber-200/70">beautifully</span>
            <br />
            managed.
          </h1>
          <p className="max-w-xs text-sm leading-relaxed text-stone-400">
            Access your collection, track commissions, and manage your
            financial records from one secure place.
          </p>
        </div>

        <p className="text-xs text-stone-600">
          © 2026 East Side Studio London. All rights reserved.
        </p>
      </div>

      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, 30px) scale(1.05); }
          66% { transform: translate(-20px, 50px) scale(0.95); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-50px, -30px) scale(1.08); }
          66% { transform: translate(30px, -50px) scale(0.92); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.3); }
        }
      `}</style>
    </div>
  );
}

export function DarkGallery() {
  const [mode, setMode] = useState<"signin" | "magic">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const simulateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans">
      {/* Left Panel */}
      <div className="hidden w-[52%] lg:block">
        <AnimatedPanel />
      </div>

      {/* Right Panel */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-8 lg:w-[48%] lg:px-16">
        {/* Mobile logo */}
        <div className="mb-10 lg:hidden">
          <img
            src="/__mockup/images/logo.png"
            alt="East Side Studio London"
            className="h-8 w-auto object-contain"
          />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-amber-600">
              Welcome back
            </p>
            <h2 className="text-2xl font-semibold text-stone-900">
              Sign in to your account
            </h2>
            <p className="mt-1 text-sm text-stone-400">
              {mode === "signin"
                ? "Enter your credentials to continue"
                : "We'll send a secure sign-in link"}
            </p>
          </div>

          {/* Mode tabs */}
          <div className="mb-6 flex rounded-lg bg-stone-100 p-1">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
                mode === "signin"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              Password
            </button>
            <button
              onClick={() => setMode("magic")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
                mode === "magic"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              Magic Link
            </button>
          </div>

          {mode === "signin" ? (
            <form onSubmit={simulateSubmit} className="space-y-4">
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300" />
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-stone-200 pl-10 text-sm focus-visible:ring-amber-500/30"
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs font-medium text-stone-600">
                    Password
                  </Label>
                  <button
                    type="button"
                    className="text-xs text-amber-600 hover:text-amber-700"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-stone-200 pl-10 text-sm focus-visible:ring-amber-500/30"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-stone-900 text-white hover:bg-stone-800"
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
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                    <Mail className="h-5 w-5 text-amber-700" />
                  </div>
                  <p className="font-medium text-stone-900">Check your inbox</p>
                  <p className="mt-1 text-sm text-stone-500">
                    Magic link sent to <strong>{email || "your email"}</strong>
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="mt-4 text-xs text-amber-600 hover:underline"
                  >
                    Send again
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
                    <Label className="mb-1.5 block text-xs font-medium text-stone-600">
                      Email address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300" />
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="border-stone-200 pl-10 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-stone-900 text-white hover:bg-stone-800"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Send Magic Link
                  </Button>
                </form>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-stone-400">or</span>
            <Separator className="flex-1" />
          </div>

          <Button
            variant="outline"
            className="mt-4 w-full border-stone-200 text-stone-700 hover:bg-stone-50"
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <p className="mt-8 text-center text-xs text-stone-400">
            No account? Contact your studio coordinator for an invitation.
          </p>
        </div>
      </div>
    </div>
  );
}
