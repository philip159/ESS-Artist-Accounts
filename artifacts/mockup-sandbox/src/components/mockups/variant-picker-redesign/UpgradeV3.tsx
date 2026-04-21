import { useState } from "react";
import { Check, Shield, Star } from "lucide-react";

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

export function UpgradeV3() {
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [frameSelected, setFrameSelected] = useState(false);

  return (
    <div className="min-h-screen p-5" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#fff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 12 }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>V3: Before/After Comparison</span>
          <p style={{ fontSize: 11, color: SUB, marginTop: 2 }}>Visual side-by-side showing what you gain</p>
        </div>

        <button type="button" onClick={() => setGlazeSelected(!glazeSelected)} style={{
          display: "flex", flexDirection: "column", gap: 0, padding: 0, width: "100%",
          border: `1.5px solid ${glazeSelected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
          background: glazeSelected ? "rgba(26,26,26,0.02)" : "#fff", cursor: "pointer",
          textAlign: "left", fontFamily: "inherit", transition: "all 0.2s",
          boxShadow: glazeSelected ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14 }}>
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
                See your artwork exactly as the artist intended — zero glare, total clarity.
              </span>
            </div>
            <Checkbox selected={glazeSelected} />
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1,
            margin: "0 14px 12px", borderRadius: 6, overflow: "hidden",
            background: "rgba(26,26,26,0.08)",
          }}>
            <div style={{ background: "#f8f8f8", padding: "10px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", height: 32, borderRadius: 4, background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(200,200,200,0.3) 40%, rgba(100,100,100,0.15) 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 20, height: 24, background: "rgba(26,26,26,0.08)", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 9.5, color: FAINT, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Standard glass</span>
              <span style={{ fontSize: 10, color: SUB }}>8% reflection, no UV shield</span>
            </div>
            <div style={{ background: "#f8f8f8", padding: "10px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", height: 32, borderRadius: 4, background: "linear-gradient(180deg, rgba(26,26,26,0.02) 0%, rgba(26,26,26,0.01) 100%)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(26,26,26,0.04)" }}>
                <div style={{ width: 20, height: 24, background: "rgba(26,26,26,0.12)", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 9.5, color: TEXT, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Museum glaze</span>
              <span style={{ fontSize: 10, color: TEXT, fontWeight: 500 }}>&lt;1% reflection, 99% UV blocked</span>
            </div>
          </div>
        </button>

        <button type="button" onClick={() => setFrameSelected(!frameSelected)} style={{
          display: "flex", flexDirection: "column", gap: 0, padding: 0, width: "100%",
          border: `1.5px solid ${frameSelected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
          background: frameSelected ? "rgba(26,26,26,0.02)" : "#fff", cursor: "pointer",
          textAlign: "left", fontFamily: "inherit", transition: "all 0.2s",
          boxShadow: frameSelected ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14 }}>
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
                Milled from solid Ash. A deep shadow-box profile that makes your artwork float.
              </span>
            </div>
            <Checkbox selected={frameSelected} />
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1,
            margin: "0 14px 12px", borderRadius: 6, overflow: "hidden",
            background: "rgba(26,26,26,0.08)",
          }}>
            <div style={{ background: "#f8f8f8", padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 9.5, color: FAINT, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: 4 }}>Standard frame</div>
              <div style={{ fontSize: 10, color: SUB }}>MDF composite</div>
              <div style={{ fontSize: 10, color: SUB }}>Thin profile</div>
            </div>
            <div style={{ background: "#f8f8f8", padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 9.5, color: TEXT, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: 4 }}>Box frame</div>
              <div style={{ fontSize: 10, color: TEXT, fontWeight: 500 }}>Solid Ash hardwood</div>
              <div style={{ fontSize: 10, color: TEXT, fontWeight: 500 }}>Deep 45mm profile</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
