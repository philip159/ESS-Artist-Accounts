import { useState } from "react";
import { Check, Shield, Sparkles } from "lucide-react";

const R = 8; const TEXT = "#1a1a1a"; const SUB = "rgba(26,26,26,0.5)"; const FAINT = "rgba(26,26,26,0.4)"; const BL = "rgba(26,26,26,0.12)"; const BORDER = "rgba(26,26,26,0.2)";

function Checkbox({ selected }: { selected: boolean }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
      border: selected ? "none" : `1.5px solid ${BORDER}`,
      background: selected ? TEXT : "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {selected && <Check size={13} color="#fff" strokeWidth={2.5} />}
    </div>
  );
}

export function UpgradeV4() {
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [frameSelected, setFrameSelected] = useState(false);

  return (
    <div className="min-h-screen p-5" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#fff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 12 }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>V4: Aspirational / Gallery-worthy</span>
          <p style={{ fontSize: 11, color: SUB, marginTop: 2 }}>Elevate — "your home deserves gallery standards"</p>
        </div>

        <button type="button" onClick={() => setGlazeSelected(!glazeSelected)} style={{
          display: "flex", flexDirection: "column", gap: 0, padding: 0, width: "100%",
          border: `1.5px solid ${glazeSelected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
          background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          transition: "all 0.2s",
          boxShadow: glazeSelected ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
        }}>
          {!glazeSelected && (
            <div style={{
              padding: "5px 14px", display: "flex", alignItems: "center", gap: 5,
              background: "rgba(26,26,26,0.03)", borderBottom: "1px solid rgba(26,26,26,0.04)",
            }}>
              <Sparkles size={10} style={{ color: "rgba(26,26,26,0.4)" }} />
              <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(26,26,26,0.45)" }}>
                Most popular upgrade
              </span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, background: glazeSelected ? "rgba(26,26,26,0.02)" : "transparent" }}>
            <div style={{
              width: 56, height: 48, borderRadius: 8, flexShrink: 0, overflow: "hidden",
              background: "linear-gradient(145deg, #c9e6f0, #a8d8ea, #90cee0)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Shield size={20} strokeWidth={1.5} style={{ color: "rgba(26,26,26,0.5)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>Moth Eye Museum Glaze</span>
                <span style={{ fontSize: 11, color: FAINT }}>+ £45</span>
              </div>
              <span style={{ fontSize: 11.5, color: SUB, lineHeight: 1.4, display: "block" }}>
                Gallery-grade nano-technology. Your artwork deserves the same protection as a Hockney or a Hirst.
              </span>
            </div>
            <Checkbox selected={glazeSelected} />
          </div>
          {glazeSelected && (
            <div style={{
              padding: "6px 14px 10px", display: "flex", alignItems: "center", gap: 6,
              background: "rgba(26,26,26,0.03)",
            }}>
              <Check size={11} style={{ color: "#2d7a3e", flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: "#2d6a35", fontWeight: 500 }}>Gallery-grade protection added</span>
            </div>
          )}
        </button>

        <button type="button" onClick={() => setFrameSelected(!frameSelected)} style={{
          display: "flex", flexDirection: "column", gap: 0, padding: 0, width: "100%",
          border: `1.5px solid ${frameSelected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
          background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          transition: "all 0.2s",
          boxShadow: frameSelected ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
        }}>
          {!frameSelected && (
            <div style={{
              padding: "5px 14px", display: "flex", alignItems: "center", gap: 5,
              background: "rgba(26,26,26,0.03)", borderBottom: "1px solid rgba(26,26,26,0.04)",
            }}>
              <Sparkles size={10} style={{ color: "rgba(26,26,26,0.4)" }} />
              <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(26,26,26,0.45)" }}>
                Gallery finish
              </span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, background: frameSelected ? "rgba(26,26,26,0.02)" : "transparent" }}>
            <div style={{
              width: 56, height: 48, borderRadius: 8, flexShrink: 0, overflow: "hidden",
              background: "linear-gradient(145deg, #333, #1a1a1a, #2a2a2a)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: 18, height: 22, border: "3px solid #555", borderRadius: 1, background: "rgba(255,255,255,0.06)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>Black Box Frame</span>
                <span style={{ fontSize: 11, color: FAINT }}>+ £40</span>
              </div>
              <span style={{ fontSize: 11.5, color: SUB, lineHeight: 1.4, display: "block" }}>
                Hand-stained solid Ash creates the shadow-box effect used in London's finest galleries.
              </span>
            </div>
            <Checkbox selected={frameSelected} />
          </div>
          {frameSelected && (
            <div style={{
              padding: "6px 14px 10px", display: "flex", alignItems: "center", gap: 6,
              background: "rgba(26,26,26,0.03)",
            }}>
              <Check size={11} style={{ color: "#2d7a3e", flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: "#2d6a35", fontWeight: 500 }}>Gallery-grade frame added</span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
