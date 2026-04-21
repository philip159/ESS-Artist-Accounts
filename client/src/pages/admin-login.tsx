import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Lock, ArrowRight, Loader2, ShieldCheck } from "lucide-react";

const IMGS = [
  { src: "/images/ess-studio-01.jpg", pos: "center center" },
  { src: "/images/ess-studio-02.jpg", pos: "center 30%" },
  { src: "/images/ess-studio-03.jpg", pos: "left center" },
];

function MosaicPanel({ ready }: { ready: boolean }) {
  return (
    <div
      className="hidden lg:flex h-full w-[54%]"
      style={{ gap: "3px", background: "#fff" }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          flex: "0 0 62%",
          opacity: ready ? 1 : 0,
          transform: ready ? "scale(1)" : "scale(0.97)",
          transition: "opacity 0.8s ease 0.1s, transform 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s",
        }}
      >
        <img src={IMGS[0].src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: IMGS[0].pos, animation: "kbA 16s ease-in-out infinite alternate" }} />
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
            <img src={IMGS[i].src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: IMGS[i].pos, animation: `kbB${i} 18s ease-in-out infinite alternate` }} />
            <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.2)" }} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes kbA  { from { transform: scale(1.0); } to { transform: scale(1.07); } }
        @keyframes kbB1 { from { transform: scale(1.07) translate(1%,0); } to { transform: scale(1.0) translate(-1%,0); } }
        @keyframes kbB2 { from { transform: scale(1.0) translate(-1%,1%); } to { transform: scale(1.07) translate(1%,-1%); } }
      `}</style>
    </div>
  );
}

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (password: string) => {
      const response = await apiRequest("POST", "/api/auth/login", { password });
      return response;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/check"] });
      navigate("/admin");
    },
    onError: () => {
      toast({
        title: "Access denied",
        description: "Invalid password. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) loginMutation.mutate(password);
  };

  const fade = {
    opacity: ready ? 1 : 0,
    transform: ready ? "none" : "translateY(10px)",
    transition: "opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)",
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <div
        className="relative z-10 flex w-full flex-col justify-center px-10 py-8 lg:w-[46%]"
        style={{ borderRight: "1px solid #e7e5e4", ...fade }}
      >
        <div className="absolute left-10 top-8 h-0.5 w-10 bg-stone-900" />

        <div className="mx-auto w-full max-w-[310px]">
          <img
            src="/logo.png"
            alt="East Side Studio London"
            className="mb-8 h-6 w-auto object-contain"
          />

          <div className="mb-7">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.35em] text-stone-400">
              Admin Portal
            </p>
            <h2 className="text-[1.15rem] font-semibold tracking-tight text-stone-900">
              Sign in
            </h2>
            <p className="mt-0.5 text-[12.5px] text-stone-400">
              Studio administrator access only
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-stone-300" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  disabled={loginMutation.isPending}
                  data-testid="input-password"
                  className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-stone-800 outline-none placeholder:text-stone-300 transition-all"
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#a8a29e"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(168,162,158,0.12)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending || !password.trim()}
              data-testid="button-login"
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
            >
              {loginMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Sign In
            </button>
          </form>

          <div className="mt-8 flex items-center gap-2">
            <ShieldCheck className="h-3 w-3 text-emerald-500" strokeWidth={2.5} />
            <span className="text-[10.5px] text-stone-300">
              Restricted access · East Side Studio
            </span>
          </div>
        </div>
      </div>

      <MosaicPanel ready={ready} />
    </div>
  );
}
