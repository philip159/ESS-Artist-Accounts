import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";

const SIZES = [
  'A4 - 8.27" x 11.67"',
  'A3 - 11.69" x 16.54"',
  'A2 - 16.54" x 23.39"',
];

const FRAMES = [
  { id: "unframed", label: "Unframed", image: null },
  { id: "black", label: "Black Frame", image: "black" },
  { id: "white", label: "White Frame", image: "white" },
  { id: "natural", label: "Natural Frame", image: "natural" },
];

const INPUT_H = 50;
const RADIUS = 8;
const LABEL_SIZE = 14;
const BORDER_DEFAULT = "1px solid rgba(26,26,26,0.2)";
const BORDER_ACTIVE = "1.5px solid #1a1a1a";
const TEXT = "#1a1a1a";
const TEXT_SUB = "rgba(26,26,26,0.5)";
const TEXT_FAINT = "rgba(26,26,26,0.4)";
const GAP = 24;

function FrameSwatch({ frame, selected, onClick }: { frame: typeof FRAMES[0]; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ width: 66, height: INPUT_H, borderRadius: RADIUS, border: "none", outline: "none", padding: 0, cursor: "pointer", overflow: "hidden", position: "relative", background: "#fff", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: RADIUS, border: selected ? BORDER_ACTIVE : "1px solid rgba(26,26,26,0.15)", pointerEvents: "none", zIndex: 2, transition: "border-color 0.15s" }} />
      {frame.image ? (
        <div style={{ width: "100%", height: "100%", background: frame.id === "black" ? "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 50%, #333 100%)" : frame.id === "white" ? "linear-gradient(135deg, #f5f5f5 0%, #fff 50%, #eee 100%)" : "linear-gradient(135deg, #d4b896 0%, #c4a87a 50%, #e0c9a8 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 20, height: 24, border: frame.id === "black" ? "3px solid #444" : frame.id === "white" ? "3px solid #ddd" : "3px solid #b8956a", borderRadius: 1, background: "rgba(255,255,255,0.15)" }} />
        </div>
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa" }}>
          <svg width="40" height="36" viewBox="0 0 40 36" fill="none" style={{ opacity: 0.3 }}>
            <rect x="8" y="4" width="24" height="28" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <line x1="6" y1="34" x2="34" y2="2" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>
      )}
    </button>
  );
}

function OptionLabel({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2" style={{ marginBottom: 8 }}>
      <span style={{ fontWeight: 600, fontSize: LABEL_SIZE, color: TEXT }}>{label}:</span>
      <span style={{ fontWeight: 400, fontSize: LABEL_SIZE, color: TEXT }}>{value}</span>
    </div>
  );
}

function SplitToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const btn = (active: boolean, side: "left" | "right"): React.CSSProperties => ({
    flex: 1,
    height: INPUT_H,
    border: "1px solid",
    borderColor: active ? TEXT : "rgba(26,26,26,0.2)",
    borderRadius: side === "left" ? `${RADIUS}px 0 0 ${RADIUS}px` : `0 ${RADIUS}px ${RADIUS}px 0`,
    background: "#fff",
    color: active ? TEXT : TEXT_SUB,
    fontWeight: 400,
    fontSize: 14,
    cursor: "pointer",
    position: "relative",
    zIndex: active ? 2 : 1,
    transition: "all 0.15s",
    fontFamily: "inherit",
    marginLeft: side === "right" ? -1 : 0,
  });
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <OptionLabel label={label} value={value ? "Yes" : "No"} />
      <div className="flex">
        <button type="button" onClick={() => onChange(true)} style={btn(value, "left")}>Yes</button>
        <button type="button" onClick={() => onChange(false)} style={btn(!value, "right")}>No</button>
      </div>
    </fieldset>
  );
}

function UpgradeCheckbox({ checked }: { checked: boolean }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
      border: checked ? "none" : "1.5px solid rgba(26,26,26,0.2)",
      background: checked ? TEXT : "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s",
    }}>
      {checked && <Check size={12} color="#fff" strokeWidth={3} />}
    </div>
  );
}

export function CollapsibleV2() {
  const [selectedSize, setSelectedSize] = useState(SIZES[0]);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState("black");
  const [mountSelected, setMountSelected] = useState(false);
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [upgradeSelected, setUpgradeSelected] = useState(false);
  const [upgradesOpen, setUpgradesOpen] = useState(false);

  const isFramed = selectedFrame !== "unframed";
  const upgradeCount = [glazeSelected, upgradeSelected].filter(Boolean).length;

  const totalPrice = (() => {
    let p = 25;
    if (isFramed) p += 30;
    if (mountSelected) p += 10;
    if (glazeSelected) p += 45;
    if (upgradeSelected) p += isFramed ? 40 : 15;
    return p;
  })();

  const summaryParts = [
    FRAMES.find(f => f.id === selectedFrame)?.label,
    mountSelected && "Mount",
    glazeSelected && "Museum Glaze",
    upgradeSelected && (isFramed ? "Box Frame" : "Photo Rag"),
  ].filter(Boolean);

  return (
    <div className="min-h-screen p-6 sm:p-8" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#ffffff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: GAP }}>

        {/* SIZE */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <OptionLabel label="Size" value={selectedSize} />
          <div className="relative">
            <button type="button" onClick={() => setSizeOpen(!sizeOpen)} className="w-full flex items-center justify-between" style={{ height: INPUT_H, padding: "0 16px", border: BORDER_DEFAULT, borderRadius: RADIUS, background: "#fff", fontSize: 14, cursor: "pointer", color: TEXT }}>
              <span>{selectedSize}</span>
              <ChevronDown size={16} style={{ opacity: 0.5, transform: sizeOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {sizeOpen && (
              <div className="absolute left-0 right-0 z-10" style={{ top: "calc(100% + 4px)", border: "1px solid rgba(26,26,26,0.15)", borderRadius: RADIUS, background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                {SIZES.map(size => (
                  <button key={size} type="button" onClick={() => { setSelectedSize(size); setSizeOpen(false); }} className="w-full text-left flex items-center justify-between" style={{ padding: "12px 16px", fontSize: 14, cursor: "pointer", background: selectedSize === size ? "rgba(26,26,26,0.04)" : "transparent", border: 0, color: TEXT, fontWeight: selectedSize === size ? 500 : 400 }}>
                    <span>{size}</span>
                    {selectedSize === size && <Check size={14} style={{ opacity: 0.5 }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </fieldset>

        {/* FRAME */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <OptionLabel label="Frame" value={FRAMES.find(f => f.id === selectedFrame)?.label || ""} />
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            {FRAMES.map(frame => <FrameSwatch key={frame.id} frame={frame} selected={selectedFrame === frame.id} onClick={() => setSelectedFrame(frame.id)} />)}
          </div>
        </fieldset>

        {/* MOUNT */}
        <SplitToggle label="Mount" value={mountSelected} onChange={setMountSelected} />

        {/* UPGRADES ACCORDION — uses same chevron pattern as Size dropdown */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <OptionLabel
            label="Upgrades"
            value={upgradeCount > 0
              ? [glazeSelected && "Museum Glaze", upgradeSelected && (isFramed ? "Box Frame" : "Photo Rag")].filter(Boolean).join(", ")
              : "None"
            }
          />
          <div style={{ border: BORDER_DEFAULT, borderRadius: RADIUS, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setUpgradesOpen(!upgradesOpen)}
              className="w-full flex items-center justify-between"
              style={{
                height: INPUT_H,
                padding: "0 16px",
                background: "#fff",
                border: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                color: upgradeCount > 0 ? TEXT : TEXT_SUB,
                fontSize: 14,
              }}
            >
              <span style={{ fontWeight: 400 }}>
                {upgradeCount > 0
                  ? `${upgradeCount} upgrade${upgradeCount > 1 ? "s" : ""} selected`
                  : "Add premium upgrades"
                }
              </span>
              <ChevronDown size={16} style={{ opacity: 0.5, transform: upgradesOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>

            {upgradesOpen && (
              <div style={{ borderTop: "1px solid rgba(26,26,26,0.08)" }}>
                {/* Museum Quality Glaze */}
                <button
                  type="button"
                  onClick={() => setGlazeSelected(!glazeSelected)}
                  className="w-full flex items-center justify-between text-left"
                  style={{
                    padding: "14px 16px",
                    border: 0,
                    background: glazeSelected ? "rgba(26,26,26,0.02)" : "#fff",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                >
                  <div className="flex flex-col" style={{ gap: 2 }}>
                    <div className="flex items-baseline" style={{ gap: 6 }}>
                      <span style={{ fontWeight: 500, fontSize: 13, color: TEXT }}>Museum Quality Glaze</span>
                      <span style={{ fontSize: 12, color: TEXT_FAINT }}>+ £45.00</span>
                    </div>
                    <span style={{ fontSize: 11, color: TEXT_FAINT, lineHeight: 1.3 }}>
                      UV-protective, anti-reflective museum glass
                    </span>
                  </div>
                  <UpgradeCheckbox checked={glazeSelected} />
                </button>

                {/* Divider */}
                <div style={{ margin: "0 16px", borderTop: "1px solid rgba(26,26,26,0.06)" }} />

                {/* Frame / Paper Upgrade */}
                <button
                  type="button"
                  onClick={() => setUpgradeSelected(!upgradeSelected)}
                  className="w-full flex items-center justify-between text-left"
                  style={{
                    padding: "14px 16px",
                    border: 0,
                    background: upgradeSelected ? "rgba(26,26,26,0.02)" : "#fff",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                >
                  <div className="flex items-center" style={{ gap: 12 }}>
                    <div style={{
                      width: 44, height: 34, borderRadius: 5, overflow: "hidden", flexShrink: 0,
                      border: upgradeSelected ? BORDER_ACTIVE : "1px solid rgba(26,26,26,0.12)",
                      background: isFramed
                        ? "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 60%, #333 100%)"
                        : "linear-gradient(135deg, #faf8f5 0%, #f5f0ea 50%, #ede5d8 100%)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "border-color 0.15s",
                    }}>
                      <div style={{
                        width: 12, height: 16,
                        border: isFramed ? "2.5px solid #444" : "1px solid rgba(26,26,26,0.1)",
                        borderRadius: 1,
                        background: isFramed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)",
                      }} />
                    </div>
                    <div className="flex flex-col" style={{ gap: 2 }}>
                      <div className="flex items-baseline" style={{ gap: 6 }}>
                        <span style={{ fontWeight: 500, fontSize: 13, color: TEXT }}>{isFramed ? "Black Box Frame" : "Hahnemuhle Photo Rag"}</span>
                        <span style={{ fontSize: 12, color: TEXT_FAINT }}>+ £{isFramed ? "40.00" : "15.00"}</span>
                      </div>
                      <span style={{ fontSize: 11, color: TEXT_FAINT, lineHeight: 1.3 }}>
                        {isFramed ? "Milled from solid Ash, hand-stained" : "Premium 308gsm cotton rag"}
                      </span>
                    </div>
                  </div>
                  <UpgradeCheckbox checked={upgradeSelected} />
                </button>
              </div>
            )}
          </div>
        </fieldset>

        {/* PRICE + CTA */}
        <div style={{ borderTop: "1px solid rgba(26,26,26,0.08)", paddingTop: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: TEXT_SUB }}>{summaryParts.join(" + ")}</span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>£{totalPrice.toFixed(2)}</span>
          </div>
          <button type="button" style={{ width: "100%", height: 54, background: TEXT, color: "#fff", border: 0, borderRadius: RADIUS, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
