import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";

const IMGS = [
  { src: "/__mockup/images/ess-studio-01.jpg", pos: "center center" },
  { src: "/__mockup/images/ess-studio-02.jpg", pos: "center 30%" },
  { src: "/__mockup/images/ess-studio-03.jpg", pos: "left center" },
];

function MosaicPanel() {
  return (
    <div className="hidden h-full w-[54%] lg:flex" style={{ gap: "3px", background: "#fff" }}>
      <div className="relative overflow-hidden" style={{ flex: "0 0 62%" }}>
        <img src={IMGS[0].src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: IMGS[0].pos, animation: "kbA 12s ease-in-out infinite alternate" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.18)" }} />
      </div>
      <div className="flex flex-1 flex-col" style={{ gap: "3px" }}>
        {[1, 2].map((i) => (
          <div key={i} className="relative flex-1 overflow-hidden">
            <img src={IMGS[i].src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: IMGS[i].pos, animation: `kbB${i} 14s ease-in-out infinite alternate` }} />
            <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.20)" }} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes kbA  { from { transform: scale(1.0); } to { transform: scale(1.07); } }
        @keyframes kbB1 { from { transform: scale(1.07) translate(1%,0);   } to { transform: scale(1.0)  translate(-1%,0); } }
        @keyframes kbB2 { from { transform: scale(1.0)  translate(-1%,1%); } to { transform: scale(1.07) translate(1%,-1%); } }
      `}</style>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, disabled = false }: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; disabled?: boolean;
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
          type={disabled ? "email" : "password"}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-stone-800 outline-none placeholder:text-stone-300 disabled:bg-stone-50 disabled:text-stone-400 transition-all"
          style={{ fontFamily: "inherit" }}
        />
      </div>
    </div>
  );
}

export function MosaicSplit() {
  const [pw, setPw] = useState("");
  const [cpw, setCpw] = useState("");
  const mismatch = pw && cpw && pw !== cpw;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <div className="relative flex w-full flex-col justify-center px-10 lg:w-[46%]" style={{ minWidth: 0 }}>
        <div className="absolute left-0 top-0 h-1 w-16 bg-stone-900" />

        <div className="mb-8 flex items-center gap-2">
          <img src="/__mockup/images/logo.png" alt="East Side Studio London" style={{ height: 20, objectFit: "contain" }} />
        </div>

        <div className="mb-6">
          <h1 className="text-[22px] font-bold leading-tight text-stone-900 tracking-tight">Create your password</h1>
          <p className="mt-1.5 text-[13px] text-stone-400 leading-relaxed">
            You've been invited to the artist portal. Set a password to get started.
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-stone-100 bg-stone-50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400 mb-0.5">Signing in as</p>
          <p className="text-[13px] text-stone-600 font-medium">philip@eastsidestudiolondon.co.uk</p>
        </div>

        <div className="space-y-4">
          <Field label="New Password" value={pw} onChange={setPw} placeholder="At least 8 characters" />
          <div>
            <Field label="Confirm Password" value={cpw} onChange={setCpw} placeholder="Re-enter your password" />
            {mismatch && <p className="mt-1.5 text-[11px] text-red-500">Passwords do not match</p>}
          </div>
        </div>

        <button
          className="mt-6 w-full rounded-lg bg-stone-900 py-3 text-[13px] font-semibold tracking-wide text-white transition-colors hover:bg-stone-800 active:bg-stone-950"
        >
          Set Password &amp; Enter Portal
        </button>

        <div className="mt-6 flex items-center gap-2 text-[11px] text-stone-400">
          <ShieldCheck size={13} className="text-stone-300" />
          <span>Your account is protected. Data is kept private and secure.</span>
        </div>
      </div>

      <MosaicPanel />
    </div>
  );
}
