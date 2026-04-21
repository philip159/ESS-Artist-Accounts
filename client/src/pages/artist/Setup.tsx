import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Lock, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

function parseHashParams(): Record<string, string> {
  const hash = window.location.hash.slice(1);
  const params: Record<string, string> = {};
  for (const part of hash.split("&")) {
    const [key, val] = part.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent((val || "").replace(/\+/g, " "));
  }
  return params;
}

function Field({
  label, type, placeholder, value, onChange, disabled,
}: {
  label: string; type: string; placeholder: string;
  value: string; onChange?: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">{label}</label>
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300">
          <Lock size={14} />
        </span>
        <input
          type={type}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-stone-800 outline-none placeholder:text-stone-300 transition-all disabled:bg-stone-50 disabled:text-stone-400 disabled:cursor-default"
          onFocus={(e) => {
            if (!disabled) {
              e.currentTarget.style.borderColor = "#a8a29e";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(168,162,158,0.12)";
            }
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "";
            e.currentTarget.style.boxShadow = "";
          }}
        />
      </div>
    </div>
  );
}

export default function ArtistSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState(true);
  const [hashError, setHashError] = useState<{ code: string; description: string } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const hash = parseHashParams();
    if (hash.error) {
      setHashError({
        code: hash.error_code || hash.error,
        description: hash.error_description || "The invitation link is invalid or has expired.",
      });
      setSupabaseLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseSession(session);
      setSupabaseLoading(false);
    });

    const timeout = setTimeout(() => setSupabaseLoading(false), 5000);
    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const setPasswordMutation = useMutation({
    mutationFn: async () => {
      if (password !== confirmPassword) throw new Error("Passwords do not match");
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Password set!", description: "Welcome to the East Side Studio artist portal." });
      setLocation("/artist");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to set password", description: error.message });
    },
  });

  const fade = {
    opacity: ready ? 1 : 0,
    transform: ready ? "none" : "translateY(10px)",
    transition: "opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)",
  };

  const mismatch = password && confirmPassword && password !== confirmPassword;

  if (supabaseLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <Loader2 className="h-7 w-7 animate-spin text-stone-300" />
      </div>
    );
  }

  if (hashError) {
    const isExpired = hashError.code === "otp_expired";
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div style={fade} className="w-full max-w-sm">
          <img src="/logo.png" alt="East Side Studio London" className="mb-10 h-5 object-contain" />
          <div className="flex flex-col items-start gap-4">
            <AlertCircle className="h-8 w-8 text-stone-300" />
            <div>
              <p className="text-[18px] font-bold text-stone-900">
                {isExpired ? "Link expired" : "Invalid link"}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-stone-400">
                {isExpired
                  ? "This invitation link has already been used or has expired. Ask your studio coordinator to send a new one."
                  : hashError.description}
              </p>
            </div>
            <button
              onClick={() => setLocation("/artist/login")}
              className="rounded-lg border border-stone-200 px-5 py-2.5 text-[13px] font-semibold text-stone-700 transition-colors hover:bg-stone-50"
            >
              Go to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!supabaseSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div style={fade} className="w-full max-w-sm">
          <img src="/logo.png" alt="East Side Studio London" className="mb-10 h-5 object-contain" />
          <div className="flex flex-col items-start gap-4">
            <AlertCircle className="h-8 w-8 text-stone-300" />
            <div>
              <p className="text-[18px] font-bold text-stone-900">Invalid invitation link</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-stone-400">
                Please check your email for the correct link, or contact your studio coordinator.
              </p>
            </div>
            <button
              onClick={() => setLocation("/artist/login")}
              className="rounded-lg border border-stone-200 px-5 py-2.5 text-[13px] font-semibold text-stone-700 transition-colors hover:bg-stone-50"
            >
              Go to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-start bg-white px-12 lg:px-20">
      <div style={fade} className="w-full max-w-sm">
        <div className="absolute left-0 top-0 h-1 w-16 bg-stone-900" />

        <img src="/logo.png" alt="East Side Studio London" className="mb-10 h-5 object-contain" />

        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-stone-900">
          Create your password
        </h1>
        <p className="mt-1.5 mb-7 text-[13px] leading-relaxed text-stone-400">
          You've been invited to the artist portal. Set a password to get started.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); setPasswordMutation.mutate(); }}
          className="space-y-4"
        >
          <Field
            label="Email"
            type="email"
            placeholder=""
            value={supabaseSession.user.email || ""}
            disabled
          />
          <Field
            label="New Password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={setPassword}
          />
          <div>
            <Field
              label="Confirm Password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
            {mismatch && (
              <p className="mt-1.5 text-[11px] text-red-500">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={setPasswordMutation.isPending || !!mismatch || !password}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-3 text-[13px] font-semibold tracking-wide text-white transition-colors hover:bg-stone-800 active:bg-stone-950 disabled:opacity-50"
          >
            {setPasswordMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Setting up…</>
            ) : (
              "Set Password & Enter Portal"
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center gap-2 text-[11px] text-stone-400">
          <ShieldCheck size={13} className="shrink-0 text-stone-300" />
          <span>Your data is private and only accessible to you and East Side Studio.</span>
        </div>
      </div>
    </div>
  );
}
