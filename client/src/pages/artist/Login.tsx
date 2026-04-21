import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, ArrowRight, Loader2, Zap, KeyRound } from "lucide-react";

const IMGS = [
  { src: "/images/ess-studio-01.jpg", pos: "center center" },
  { src: "/images/ess-studio-02.jpg", pos: "center 30%" },
  { src: "/images/ess-studio-03.jpg", pos: "left center" },
];

function MosaicPanel({ ready }: { ready: boolean }) {
  return (
    <div className="hidden h-full w-[54%] lg:flex" style={{ gap: "3px", background: "#fff" }}>
      <div
        className="relative overflow-hidden"
        style={{
          flex: "0 0 62%",
          opacity: ready ? 1 : 0,
          transform: ready ? "scale(1)" : "scale(0.97)",
          transition: "opacity 0.8s ease 0.1s, transform 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s",
        }}
      >
        <img src={IMGS[0].src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: IMGS[0].pos, animation: "kbMosaicA 12s ease-in-out infinite alternate" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.18)" }} />
      </div>
      <div className="flex flex-1 flex-col" style={{ gap: "3px" }}>
        {[1, 2].map((i) => (
          <div
            key={i}
            className="relative flex-1 overflow-hidden"
            style={{
              opacity: ready ? 1 : 0,
              transform: ready ? "scale(1)" : "scale(0.97)",
              transition: `opacity 0.8s ease ${0.15 + i * 0.1}s, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.1}s`,
            }}
          >
            <img src={IMGS[i].src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: IMGS[i].pos, animation: `kbMosaicB${i} 14s ease-in-out infinite alternate` }} />
            <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.2)" }} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes kbMosaicA  { from { transform: scale(1.0); } to { transform: scale(1.07); } }
        @keyframes kbMosaicB1 { from { transform: scale(1.07) translate(1%,0);  } to { transform: scale(1.0)  translate(-1%,0); } }
        @keyframes kbMosaicB2 { from { transform: scale(1.0)  translate(-1%,1%); } to { transform: scale(1.07) translate(1%,-1%); } }
      `}</style>
    </div>
  );
}

function Field({ label, icon, type, placeholder, value, onChange, right, autoFocus, disabled }: {
  label: string; icon: React.ReactNode; type: string; placeholder: string;
  value: string; onChange: (v: string) => void; right?: React.ReactNode;
  autoFocus?: boolean; disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">{label}</label>
        {right}
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300">{icon}</span>
        <input
          type={type} placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus} disabled={disabled}
          className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-stone-800 outline-none placeholder:text-stone-300 transition-all disabled:opacity-50"
          onFocus={(e) => { e.currentTarget.style.borderColor = "#a8a29e"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(168,162,158,0.12)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
        />
      </div>
    </div>
  );
}

type Mode = "signin" | "magic" | "reset" | "mfa";

export default function ArtistLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  const handlePostSignIn = async () => {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.nextLevel === "aal2" && aalData.nextLevel !== aalData.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (totp) {
        setMfaFactorId(totp.id);
        setMode("mfa");
        return;
      }
    }
    setLocation("/artist");
  };

  useEffect(() => {
    // A single "handled" flag prevents double-firing when both INITIAL_SESSION
    // and SIGNED_IN fire for the same magic-link callback.
    let handled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // INITIAL_SESSION  — fires immediately on subscribe if a session already exists
      //                    (magic link processed before component mounted)
      // SIGNED_IN        — fires when Supabase finishes processing the hash tokens
      //                    (magic link processed after component mounted)
      // USER_UPDATED     — fires after MFA verification upgrades the session to AAL2
      if (
        (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") &&
        session &&
        !handled
      ) {
        handled = true;
        await handlePostSignIn();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fade = {
    opacity: ready ? 1 : 0,
    transform: ready ? "none" : "translateY(10px)",
    transition: "opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)",
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ variant: "destructive", title: "Sign in failed", description: error.message });
        return;
      }
      // Check if MFA is required
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.nextLevel === "aal2" && aalData.nextLevel !== aalData.currentLevel) {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (totp) {
          setMfaFactorId(totp.id);
          setMode("mfa");
        } else {
          setLocation("/artist");
        }
      } else {
        setLocation("/artist");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code: mfaCode.replace(/\s/g, ""),
      });
      if (error) {
        toast({ variant: "destructive", title: "Invalid code", description: "Check your authenticator app and try again." });
        setMfaCode("");
      } else {
        setLocation("/artist");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          redirectTo: `${window.location.origin}/artist/login`,
        },
      });
      if (error) {
        toast({ variant: "destructive", title: "Failed to send link", description: error.message });
      } else {
        setMagicLinkSent(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/artist/login`,
      });
      if (error) {
        toast({ variant: "destructive", title: "Failed to send reset email", description: error.message });
      } else {
        setResetSent(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m); setMagicLinkSent(false); setResetSent(false); setMfaCode("");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <div
        className="relative z-10 flex w-full flex-col justify-center overflow-y-auto px-10 py-8 lg:w-[46%]"
        style={{ borderRight: "1px solid #e7e5e4", ...fade }}
      >
        <div className="absolute left-10 top-8 h-0.5 w-10 bg-stone-900" />
        <div className="mx-auto w-full max-w-[310px]">
          <img src="/logo.png" alt="East Side Studio London" className="mb-8 h-6 w-auto object-contain" />

          <div className="mb-7">
            <h2 className="mb-0.5 text-[1.15rem] font-semibold tracking-tight text-stone-900">
              {mode === "reset" ? "Reset password" : mode === "mfa" ? "Two-factor auth" : "Sign in"}
            </h2>
            <p className="text-[12.5px] text-stone-400">
              {mode === "signin" && "Email and password"}
              {mode === "magic" && "Passwordless sign-in"}
              {mode === "reset" && "We'll send a reset link"}
              {mode === "mfa" && "Enter the code from your authenticator app"}
            </p>
          </div>

          {/* Pill toggle — only for signin / magic */}
          {mode !== "reset" && mode !== "mfa" && (
            <div className="mb-6 inline-flex rounded-full bg-stone-100 p-[3px]">
              {(["signin", "magic"] as const).map((m) => (
                <button key={m} onClick={() => switchMode(m)}
                  className="rounded-full px-4 py-[7px] text-[11px] font-semibold transition-all duration-200"
                  style={{ background: mode === m ? "#1c1917" : "transparent", color: mode === m ? "#fff" : "#78716c", boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.15)" : "none" }}>
                  {m === "signin" ? "Password" : "Magic Link"}
                </button>
              ))}
            </div>
          )}

          {/* Password sign-in */}
          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-3.5" data-testid="form-signin">
              <Field label="Email" icon={<Mail size={14} />} type="email" placeholder="your@email.com" value={email} onChange={setEmail} autoFocus disabled={isLoading} />
              <Field label="Password" icon={<Lock size={14} />} type="password" placeholder="••••••••" value={password} onChange={setPassword} disabled={isLoading}
                right={<button type="button" onClick={() => switchMode("reset")} className="text-[10px] font-medium text-stone-400 underline-offset-2 hover:underline">Forgot?</button>} />
              <button type="submit" disabled={isLoading || !email || !password} data-testid="button-login"
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white hover:bg-stone-800 disabled:opacity-50 transition-colors">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Sign In
              </button>
            </form>
          )}

          {/* Magic link */}
          {mode === "magic" && (
            magicLinkSent ? (
              <div className="rounded-xl border border-stone-100 bg-stone-50 px-5 py-6 text-center">
                <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-stone-200"><Mail className="h-4 w-4 text-stone-600" /></div>
                <p className="text-[13px] font-semibold text-stone-900">Check your inbox</p>
                <p className="mt-1 text-[12px] text-stone-400">Sent to <span className="text-stone-600">{email}</span></p>
                <button onClick={() => setMagicLinkSent(false)} className="mt-4 text-[11px] text-stone-400 hover:underline">Try again</button>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-3.5" data-testid="form-magic">
                <Field label="Email" icon={<Mail size={14} />} type="email" placeholder="your@email.com" value={email} onChange={setEmail} autoFocus disabled={isLoading} />
                <button type="submit" disabled={isLoading || !email}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white hover:bg-stone-800 disabled:opacity-50 transition-colors">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Send Magic Link
                </button>
              </form>
            )
          )}

          {/* Password reset */}
          {mode === "reset" && (
            resetSent ? (
              <div className="rounded-xl border border-stone-100 bg-stone-50 px-5 py-6 text-center">
                <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-stone-200"><Mail className="h-4 w-4 text-stone-600" /></div>
                <p className="text-[13px] font-semibold text-stone-900">Reset link sent</p>
                <p className="mt-1 text-[12px] text-stone-400">Check your email for a link to reset your password.</p>
                <button onClick={() => switchMode("signin")} className="mt-4 text-[11px] text-stone-400 hover:underline">Back to sign in</button>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-3.5" data-testid="form-reset">
                <Field label="Email" icon={<Mail size={14} />} type="email" placeholder="your@email.com" value={email} onChange={setEmail} autoFocus disabled={isLoading} />
                <button type="submit" disabled={isLoading || !email}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white hover:bg-stone-800 disabled:opacity-50 transition-colors">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Send Reset Link
                </button>
                <button type="button" onClick={() => switchMode("signin")} className="w-full text-center text-[11px] text-stone-400 hover:underline">
                  Back to sign in
                </button>
              </form>
            )
          )}

          {/* MFA challenge */}
          {mode === "mfa" && (
            <form onSubmit={handleMfaVerify} className="space-y-3.5" data-testid="form-mfa">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Authenticator Code</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300"><KeyRound size={14} /></span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="000 000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    autoFocus
                    maxLength={6}
                    disabled={isLoading}
                    className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-[16px] font-mono tracking-[0.3em] text-stone-800 outline-none placeholder:text-stone-300 placeholder:tracking-normal transition-all disabled:opacity-50"
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#a8a29e"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(168,162,158,0.12)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
                  />
                </div>
              </div>
              <button type="submit" disabled={isLoading || mfaCode.length < 6}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white hover:bg-stone-800 disabled:opacity-50 transition-colors">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Verify
              </button>
              <button type="button" onClick={() => switchMode("signin")} className="w-full text-center text-[11px] text-stone-400 hover:underline">
                Back to sign in
              </button>
            </form>
          )}

          <div className="mt-6">
            <span className="text-[10.5px] text-stone-400">Invite only — <a href="https://eastsidestudiolondon.co.uk/pages/artists-sell-with-us" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-stone-600 transition-colors">Apply as a featured artist here.</a></span>
          </div>
        </div>
      </div>
      <MosaicPanel ready={ready} />
    </div>
  );
}
