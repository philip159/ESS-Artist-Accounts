import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

export function CinematicCard() {
  const [pw, setPw] = useState("");
  const [cpw, setCpw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const mismatch = pw && cpw && pw !== cpw;

  return (
    <div className="relative flex h-screen w-full items-center justify-start overflow-hidden">
      <img
        src="/__mockup/images/ess-studio-01.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "center 40%", animation: "kbCinematic 18s ease-in-out infinite alternate" }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(105deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.15) 100%)" }} />

      <div className="relative z-10 ml-16 w-full max-w-[380px]">
        <div className="mb-7">
          <img src="/__mockup/images/logo.png" alt="East Side Studio London" style={{ height: 18, objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.9 }} />
        </div>

        <h1 className="mb-1 text-[26px] font-bold leading-tight text-white tracking-tight">
          Create your password
        </h1>
        <p className="mb-7 text-[13px] text-white/60 leading-relaxed">
          Welcome. Set a password to access<br />your East Side Studio artist portal.
        </p>

        <div className="mb-4 rounded-lg px-4 py-3" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40 mb-0.5">Signing in as</p>
          <p className="text-[13px] text-white/80 font-medium">philip@eastsidestudiolondon.co.uk</p>
        </div>

        <div className="space-y-3">
          {[
            { label: "New Password", value: pw, setter: setPw, show: showPw, toggle: () => setShowPw(v => !v) },
            { label: "Confirm Password", value: cpw, setter: setCpw, show: showCpw, toggle: () => setShowCpw(v => !v) },
          ].map(({ label, value, setter, show, toggle }) => (
            <div key={label}>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                  <Lock size={14} />
                </span>
                <input
                  type={show ? "text" : "password"}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg py-2.5 pl-9 pr-10 text-[13px] text-white outline-none placeholder:text-white/25 transition-all"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                />
                <button onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          ))}
          {mismatch && <p className="text-[11px] text-red-400">Passwords do not match</p>}
        </div>

        <button className="mt-5 w-full rounded-lg py-3 text-[13px] font-semibold tracking-wide text-stone-900 transition-colors hover:opacity-90"
          style={{ background: "rgba(255,255,255,0.95)" }}>
          Set Password &amp; Enter Portal
        </button>

        <p className="mt-5 text-[11px] text-white/35 leading-relaxed">
          Your data is confidential and only accessible to you and East Side Studio.
        </p>
      </div>

      <style>{`
        @keyframes kbCinematic { from { transform: scale(1.0); } to { transform: scale(1.06); } }
      `}</style>
    </div>
  );
}
