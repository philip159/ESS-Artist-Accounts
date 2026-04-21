import { useState, useEffect } from "react";
import { Mail, Lock, ArrowRight, Loader2, Zap, ShieldCheck } from "lucide-react";

const PANELS = [
  { src: "/__mockup/images/ess-studio-01.jpg", pos: "center center", label: "Creator\nCollab" },
  { src: "/__mockup/images/ess-studio-02.jpg", pos: "center 25%",   label: "Gallery\nWall" },
  { src: "/__mockup/images/ess-studio-03.jpg", pos: "left center",  label: "At Home\nwith Art" },
];

function TriptychPanel({ ready }: { ready: boolean }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive(i => (i + 1) % PANELS.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="relative hidden h-full w-[54%] lg:flex"
      style={{ gap: "2px", background: "#000" }}
    >
      {PANELS.map((p, i) => {
        const isActive = i === active;
        return (
          <div
            key={i}
            onClick={() => setActive(i)}
            style={{
              position: "relative",
              flex: isActive ? "0 0 56%" : "0 0 22%",
              transition: "flex 0.7s cubic-bezier(0.4,0,0.2,1)",
              overflow: "hidden",
              cursor: "pointer",
              opacity: ready ? 1 : 0,
              transform: ready ? "translateY(0)" : "translateY(20px)",
              transitionDelay: `${i * 80 + 100}ms`,
              transitionProperty: ready ? "flex, opacity, transform" : "opacity, transform",
            }}
          >
            <img
              src={p.src}
              alt={p.label}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", objectPosition: p.pos,
                transform: isActive ? "scale(1.03)" : "scale(1.1)",
                transition: "transform 0.7s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
            {/* Dark tint */}
            <div style={{ position:"absolute", inset:0, background: isActive?"rgba(0,0,0,0.22)":"rgba(0,0,0,0.55)", transition:"background 0.7s ease" }} />

            {/* Vertical label — shown when inactive */}
            <div
              style={{
                position:"absolute", left:"50%", top:"50%",
                transform:"translate(-50%,-50%) rotate(-90deg)",
                whiteSpace:"nowrap",
                fontSize:"9px", fontWeight:700, letterSpacing:"0.3em",
                textTransform:"uppercase", color:"rgba(255,255,255,0.6)",
                opacity: isActive ? 0 : 1,
                transition:"opacity 0.4s ease",
              }}
            >
              {p.label.replace("\n"," ")}
            </div>

            {/* Caption — shown when active */}
            <div
              style={{
                position:"absolute", bottom:0, left:0, right:0,
                padding:"32px 20px 20px",
                background:"linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)",
                opacity: isActive ? 1 : 0,
                transform: isActive ? "translateY(0)" : "translateY(8px)",
                transition:"opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s",
              }}
            >
              <p style={{ fontSize:"9px", fontWeight:700, letterSpacing:"0.25em", textTransform:"uppercase", color:"rgba(255,255,255,0.5)", marginBottom:"4px" }}>
                East Side Studio
              </p>
              <p style={{ fontFamily:"'Playfair Display', serif", fontSize:"1.05rem", fontWeight:300, color:"rgba(255,255,255,0.92)", lineHeight:1.25 }}>
                {p.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, icon, type, placeholder, value, onChange, right }: any) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">{label}</label>{right}
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300">{icon}</span>
        <input type={type} placeholder={placeholder} value={value} onChange={(e: any) => onChange(e.target.value)}
          className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-stone-800 outline-none placeholder:text-stone-300 transition-all"
          onFocus={(e: any) => { e.target.style.borderColor="#a8a29e"; e.target.style.boxShadow="0 0 0 3px rgba(168,162,158,0.12)"; }}
          onBlur={(e: any) => { e.target.style.borderColor=""; e.target.style.boxShadow=""; }} />
      </div>
    </div>
  );
}

export function ImageTriptych() {
  const [mode, setMode] = useState<"signin"|"magic">("signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); const [sent, setSent] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 80); return () => clearTimeout(t); }, []);
  const fade = { opacity: ready?1:0, transform: ready?"none":"translateY(10px)", transition: "opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1)" };
  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <div className="relative z-10 flex w-full flex-col justify-center overflow-y-auto px-10 py-8 lg:w-[46%]"
        style={{ borderRight: "1px solid #e7e5e4", ...fade }}>
        <div className="absolute left-10 top-8 h-0.5 w-10 bg-stone-900" />
        <div className="mx-auto w-full max-w-[310px]">
          <img src="/__mockup/images/logo.png" alt="East Side Studio London" className="mb-8 h-6 w-auto object-contain" />
          <div className="mb-7">
            <h2 className="mb-0.5 text-[1.15rem] font-semibold tracking-tight text-stone-900">Sign in</h2>
            <p className="text-[12.5px] text-stone-400">{mode==="signin"?"Email and password":"Passwordless sign-in"}</p>
          </div>
          <div className="mb-6 inline-flex rounded-full bg-stone-100 p-[3px]">
            {(["signin","magic"] as const).map(m=>(
              <button key={m} onClick={()=>setMode(m)} className="rounded-full px-4 py-[7px] text-[11px] font-semibold transition-all duration-200"
                style={{background:mode===m?"#1c1917":"transparent",color:mode===m?"#fff":"#78716c",boxShadow:mode===m?"0 1px 3px rgba(0,0,0,0.15)":"none"}}>
                {m==="signin"?"Password":"Magic Link"}
              </button>
            ))}
          </div>
          {mode==="signin"?(
            <form onSubmit={e=>{e.preventDefault();setLoading(true);setTimeout(()=>setLoading(false),1400);}} className="space-y-3.5">
              <Field label="Email" icon={<Mail size={14}/>} type="email" placeholder="your@email.com" value={email} onChange={setEmail}/>
              <Field label="Password" icon={<Lock size={14}/>} type="password" placeholder="••••••••" value={password} onChange={setPassword}
                right={<button type="button" className="text-[10px] font-medium text-stone-400 hover:underline underline-offset-2">Forgot?</button>}/>
              <button type="submit" disabled={loading} className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white hover:bg-stone-800 disabled:opacity-60 transition-colors">
                {loading?<Loader2 className="h-4 w-4 animate-spin"/>:<ArrowRight className="h-4 w-4"/>} Sign In
              </button>
            </form>
          ):sent?(
            <div className="rounded-xl border border-stone-100 bg-stone-50 px-5 py-6 text-center">
              <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-stone-200"><Mail className="h-4 w-4 text-stone-600"/></div>
              <p className="text-[13px] font-semibold text-stone-900">Check your inbox</p>
              <p className="mt-1 text-[12px] text-stone-400">Sent to <span className="text-stone-600">{email||"your email"}</span></p>
              <button onClick={()=>setSent(false)} className="mt-4 text-[11px] text-stone-400 hover:underline">Try again</button>
            </div>
          ):(
            <form onSubmit={e=>{e.preventDefault();setSent(true);}} className="space-y-3.5">
              <Field label="Email" icon={<Mail size={14}/>} type="email" placeholder="your@email.com" value={email} onChange={setEmail}/>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 py-2.5 text-[13px] font-semibold text-white hover:bg-stone-800 transition-colors">
                <Zap className="h-4 w-4"/> Send Magic Link
              </button>
            </form>
          )}
          <div className="mt-5 flex items-center gap-3"><div className="h-px flex-1 bg-stone-100"/><span className="text-[10px] text-stone-300">or</span><div className="h-px flex-1 bg-stone-100"/></div>
          <button type="button" className="mt-3.5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-stone-200 py-2.5 text-[12.5px] font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>
          <div className="mt-6 flex items-center gap-2"><ShieldCheck className="h-3 w-3 text-emerald-500" strokeWidth={2.5}/><span className="text-[10.5px] text-stone-300">256-bit encrypted · Invite-only access</span></div>
        </div>
      </div>
      <TriptychPanel ready={ready}/>
    </div>
  );
}
