import { useState } from "react";
import { Check, Shield } from "lucide-react";

const R = 8; const TEXT = "#1a1a1a"; const SUB = "rgba(26,26,26,0.5)"; const FAINT = "rgba(26,26,26,0.4)"; const BL = "rgba(26,26,26,0.12)"; const BORDER = "rgba(26,26,26,0.2)";

function UpgradeCard({ selected, onToggle, children }: { selected: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onToggle} style={{
      display: "flex", flexDirection: "column", gap: 0, padding: 0, width: "100%",
      border: `1.5px solid ${selected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
      background: selected ? "rgba(26,26,26,0.02)" : "#fff", cursor: "pointer",
      textAlign: "left", fontFamily: "inherit",
      transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
      boxShadow: selected ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
    }}>
      {children}
    </button>
  );
}

function Checkbox({ selected }: { selected: boolean }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
      border: selected ? "none" : `1.5px solid ${BORDER}`,
      background: selected ? TEXT : "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s",
    }}>
      {selected && <Check size={13} color="#fff" strokeWidth={2.5} />}
    </div>
  );
}

export function UpgradeV1() {
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [frameSelected, setFrameSelected] = useState(false);

  return (
    <div className="min-h-screen p-5" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#fff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 12 }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>V1: Social Proof + Stats</span>
          <p style={{ fontSize: 11, color: SUB, marginTop: 2 }}>Lead with authority — gallery standards, measurable specs</p>
        </div>

        <UpgradeCard selected={glazeSelected} onToggle={() => setGlazeSelected(!glazeSelected)}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 14px 10px" }}>
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
                The same glazing used by the National Gallery and Tate. Nano-structured surface eliminates 99% of reflections.
              </span>
            </div>
            <Checkbox selected={glazeSelected} />
          </div>
          <div style={{ padding: "0 14px 12px", display: "flex", gap: 16 }}>
            {[
              { stat: "99%", label: "UV blocked" },
              { stat: "<1%", label: "Reflection" },
              { stat: "100+", label: "Year protection" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1 }}>{s.stat}</div>
                <div style={{ fontSize: 9.5, color: FAINT, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </UpgradeCard>

        <UpgradeCard selected={frameSelected} onToggle={() => setFrameSelected(!frameSelected)}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 14px 10px" }}>
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
                Hand-stained solid Ash. Deep box profile creates a shadow gap that makes your artwork float.
              </span>
            </div>
            <Checkbox selected={frameSelected} />
          </div>
          <div style={{ padding: "0 14px 12px", display: "flex", gap: 16 }}>
            {[
              { stat: "Ash", label: "Solid hardwood" },
              { stat: "45mm", label: "Deep profile" },
              { stat: "Hand", label: "Stained finish" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1 }}>{s.stat}</div>
                <div style={{ fontSize: 9.5, color: FAINT, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </UpgradeCard>
      </div>
    </div>
  );
}
