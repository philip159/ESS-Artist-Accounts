import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Shield } from "lucide-react";

const R = 8; const TEXT = "#1a1a1a"; const SUB = "rgba(26,26,26,0.5)"; const FAINT = "rgba(26,26,26,0.4)"; const BORDER = "rgba(26,26,26,0.2)"; const BL = "rgba(26,26,26,0.12)";

function AddonCard({ label, price, desc, specs, selected, onClick, icon }: any) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "flex", flexDirection: "column", padding: 0, width: "100%",
      border: `1.5px solid ${selected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
      background: selected ? "rgba(26,26,26,0.02)" : "#fff",
      cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.2s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14 }}>
        <div style={{ width: 56, height: 48, borderRadius: 8, flexShrink: 0, background: "linear-gradient(145deg, #c9e6f0, #a8d8ea)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{label}</span>
            <span style={{ fontSize: 11, color: FAINT }}>{price}</span>
          </div>
          <span style={{ fontSize: 11.5, color: SUB, lineHeight: 1.45, display: "block" }}>{desc}</span>
        </div>
        <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: selected ? "none" : `1.5px solid ${BORDER}`, background: selected ? TEXT : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {selected && <Check size={13} color="#fff" strokeWidth={2.5} />}
        </div>
      </div>
      {specs && (
        <div style={{ padding: "8px 14px 10px", borderTop: "1px solid rgba(26,26,26,0.04)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          {specs.map((s: string, i: number) => (
            <span key={i}><span style={{ fontSize: 10, color: FAINT }}>{s}</span>{i < specs.length - 1 && <span style={{ fontSize: 10, color: "rgba(26,26,26,0.15)", marginLeft: 12 }}>|</span>}</span>
          ))}
        </div>
      )}
    </button>
  );
}

export function AnimSpring() {
  const [open, setOpen] = useState(false);
  const [glaze, setGlaze] = useState(false);
  const [frame, setFrame] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) setHeight(contentRef.current.scrollHeight);
  }, [open, glaze, frame]);

  const count = [glaze, frame].filter(Boolean).length;

  return (
    <div style={{ width: 480, margin: "0 auto", padding: 32, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ marginBottom: 12, textAlign: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: SUB }}>D. Spring Bounce</span>
        <p style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>Overshoots slightly then settles. Playful, energetic, tactile feel.</p>
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: R, overflow: "hidden" }}>
        <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between" style={{
          height: 42, padding: "0 14px", background: "#fff", border: 0, cursor: "pointer",
          fontFamily: "inherit", color: count > 0 ? TEXT : SUB, fontSize: 13,
        }}>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span>{count > 0 ? `${count} upgrade${count > 1 ? "s" : ""} selected` : "Add premium upgrades"}</span>
            {count > 0 && !open && <span style={{ fontSize: 10, fontWeight: 600, background: TEXT, color: "#fff", borderRadius: 8, padding: "1px 6px" }}>{count}</span>}
          </div>
          <ChevronDown size={14} style={{ opacity: 0.5, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
        </button>
        <div style={{
          maxHeight: open ? height + 40 : 0,
          overflow: "hidden",
          transition: open
            ? "max-height 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
            : "max-height 0.3s cubic-bezier(0.4, 0, 1, 1)",
        }}>
          <div ref={contentRef} style={{
            padding: 12, display: "flex", flexDirection: "column", gap: 10,
            borderTop: `1px solid rgba(26,26,26,0.06)`,
            opacity: open ? 1 : 0,
            transform: open ? "translateY(0)" : "translateY(-8px)",
            transition: open
              ? "opacity 0.25s ease 0.1s, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s"
              : "opacity 0.2s ease, transform 0.2s ease",
          }}>
            <AddonCard label="Museum Grade Glaze" price="+ £45" desc="Nano-structured acrylic. Virtually eliminates reflections." specs={["99% UV protection", "<1% reflection", "Shatter-resistant"]} selected={glaze} onClick={() => setGlaze(!glaze)} icon={<Shield size={20} strokeWidth={1.5} style={{ color: "rgba(26,26,26,0.5)" }} />} />
            <AddonCard label="Black Box Frame" price="+ £90" desc="Hand-stained solid Ash with a deep shadow-box profile." specs={["Solid Ash hardwood", "45mm deep profile", "Hand-stained"]} selected={frame} onClick={() => setFrame(!frame)} icon={<div style={{ width: 18, height: 22, border: "3px solid #555", borderRadius: 1, background: "rgba(255,255,255,0.06)" }} />} />
          </div>
        </div>
      </div>
    </div>
  );
}
