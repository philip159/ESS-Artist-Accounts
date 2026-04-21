import { useState } from "react";
import { Check, Shield, AlertTriangle } from "lucide-react";

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

export function UpgradeV2() {
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [frameSelected, setFrameSelected] = useState(false);

  return (
    <div className="min-h-screen p-5" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#fff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 12 }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>V2: Loss Aversion</span>
          <p style={{ fontSize: 11, color: SUB, marginTop: 2 }}>What happens WITHOUT the upgrade — protect your investment</p>
        </div>

        <button type="button" onClick={() => setGlazeSelected(!glazeSelected)} style={{
          display: "flex", flexDirection: "column", gap: 0, padding: 0, width: "100%",
          border: `1.5px solid ${glazeSelected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
          background: glazeSelected ? "rgba(26,26,26,0.02)" : "#fff", cursor: "pointer",
          textAlign: "left", fontFamily: "inherit",
          transition: "all 0.2s",
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
                Nano-structured surface virtually eliminates reflections. See your artwork as the artist intended.
              </span>
            </div>
            <Checkbox selected={glazeSelected} />
          </div>
          {!glazeSelected && (
            <div style={{
              padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
              background: "rgba(200, 120, 50, 0.06)", borderTop: "1px solid rgba(200, 120, 50, 0.1)",
            }}>
              <AlertTriangle size={13} style={{ color: "#b07030", flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: "#8a5a28", lineHeight: 1.3 }}>
                Without museum glazing, UV light causes visible fading within 5–10 years. This cannot be reversed.
              </span>
            </div>
          )}
          {glazeSelected && (
            <div style={{
              padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
              background: "rgba(40, 120, 60, 0.05)", borderTop: "1px solid rgba(40, 120, 60, 0.08)",
            }}>
              <Shield size={13} style={{ color: "#2d7a3e", flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: "#2d6a35", lineHeight: 1.3 }}>
                Your artwork is protected. Colours preserved for 100+ years.
              </span>
            </div>
          )}
        </button>

        <button type="button" onClick={() => setFrameSelected(!frameSelected)} style={{
          display: "flex", flexDirection: "column", gap: 0, padding: 0, width: "100%",
          border: `1.5px solid ${frameSelected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
          background: frameSelected ? "rgba(26,26,26,0.02)" : "#fff", cursor: "pointer",
          textAlign: "left", fontFamily: "inherit",
          transition: "all 0.2s",
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
                Our most luxurious frame. Milled from solid Ash and hand-stained for a gallery finish.
              </span>
            </div>
            <Checkbox selected={frameSelected} />
          </div>
          {!frameSelected && (
            <div style={{
              padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
              background: "rgba(200, 120, 50, 0.06)", borderTop: "1px solid rgba(200, 120, 50, 0.1)",
            }}>
              <AlertTriangle size={13} style={{ color: "#b07030", flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: "#8a5a28", lineHeight: 1.3 }}>
                Standard frames use softwood. A hardwood box frame lasts a lifetime and elevates your print.
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
