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

function FrameSwatch({ frame, selected, onClick }: { frame: typeof FRAMES[0]; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ width: 66, height: 50, borderRadius: 8, border: "none", outline: "none", padding: 0, cursor: "pointer", overflow: "hidden", position: "relative", background: "#fff", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 8, border: selected ? "1.5px solid #1a1a1a" : "1px solid rgba(26,26,26,0.15)", pointerEvents: "none", zIndex: 2, transition: "border-color 0.15s" }} />
      {frame.image ? (
        <div style={{ width: "100%", height: "100%", background: frame.id === "black" ? "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 50%, #333 100%)" : frame.id === "white" ? "linear-gradient(135deg, #f5f5f5 0%, #fff 50%, #eee 100%)" : "linear-gradient(135deg, #d4b896 0%, #c4a87a 50%, #e0c9a8 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 20, height: 24, border: frame.id === "black" ? "3px solid #444" : frame.id === "white" ? "3px solid #ddd" : "3px solid #b8956a", borderRadius: 1, background: "rgba(255,255,255,0.15)" }} />
        </div>
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa" }}>
          <svg width="40" height="36" viewBox="0 0 40 36" fill="none" style={{ opacity: 0.3 }}><rect x="8" y="4" width="24" height="28" rx="1" stroke="currentColor" strokeWidth="1.5" /><line x1="6" y1="34" x2="34" y2="2" stroke="currentColor" strokeWidth="1" /></svg>
        </div>
      )}
    </button>
  );
}

function SplitToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, height: 44, border: "1px solid", borderColor: active ? "#1a1a1a" : "rgba(26,26,26,0.2)", background: "#fff", color: active ? "#1a1a1a" : "rgba(26,26,26,0.5)", fontWeight: 400, fontSize: 13, cursor: "pointer", position: "relative", zIndex: active ? 2 : 1, transition: "all 0.15s", fontFamily: "inherit",
  });
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="flex items-baseline gap-2" style={{ marginBottom: 6 }}>
        <legend style={{ fontWeight: 600, fontSize: 13 }}>{label}:</legend>
        <span style={{ fontWeight: 400, fontSize: 13 }}>{value ? "Yes" : "No"}</span>
      </div>
      <div className="flex">
        <button type="button" onClick={() => onChange(true)} style={{ ...btnStyle(value), borderRadius: "8px 0 0 8px" }}>Yes</button>
        <button type="button" onClick={() => onChange(false)} style={{ ...btnStyle(!value), borderRadius: "0 8px 8px 0", marginLeft: -1 }}>No</button>
      </div>
    </fieldset>
  );
}

interface UpgradeCardProps {
  label: string;
  price: string;
  description: string;
  active: boolean;
  onClick: () => void;
  thumbnail?: React.ReactNode;
}

function UpgradeCard({ label, price, description, active, onClick, thumbnail }: UpgradeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center text-left"
      style={{
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid",
        borderColor: active ? "#1a1a1a" : "rgba(26,26,26,0.12)",
        background: active ? "rgba(26,26,26,0.03)" : "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >
      {thumbnail && (
        <div style={{ width: 44, height: 34, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
          {thumbnail}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline" style={{ gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
          <span style={{ fontSize: 12, color: "rgba(26,26,26,0.4)" }}>{price}</span>
        </div>
        <span style={{ fontSize: 11, color: "rgba(26,26,26,0.4)", lineHeight: 1.3 }}>{description}</span>
      </div>
      <div style={{
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        border: active ? "none" : "1.5px solid rgba(26,26,26,0.2)",
        background: active ? "#1a1a1a" : "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
      }}>
        {active && <Check size={11} color="#fff" strokeWidth={3} />}
      </div>
    </button>
  );
}

export function SummaryBar() {
  const [selectedSize, setSelectedSize] = useState(SIZES[0]);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState("black");
  const [mountSelected, setMountSelected] = useState(false);
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [upgradeSelected, setUpgradeSelected] = useState(false);

  const isFramed = selectedFrame !== "unframed";

  const totalPrice = (() => {
    let p = 25;
    if (isFramed) p += 30;
    if (mountSelected) p += 10;
    if (glazeSelected) p += 45;
    if (upgradeSelected) p += isFramed ? 40 : 15;
    return p;
  })();

  return (
    <div className="min-h-screen p-6 sm:p-8" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: "#1a1a1a", background: "#ffffff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 24 }}>

        {/* SIZE */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="flex items-baseline gap-2" style={{ marginBottom: 8 }}>
            <legend style={{ fontWeight: 600, fontSize: 14 }}>Size:</legend>
            <span style={{ fontWeight: 400, fontSize: 14 }}>{selectedSize}</span>
          </div>
          <div className="relative">
            <button type="button" onClick={() => setSizeOpen(!sizeOpen)} className="w-full flex items-center justify-between" style={{ height: 50, padding: "0 16px", border: "1px solid rgba(26,26,26,0.2)", borderRadius: 8, background: "#fff", fontSize: 14, cursor: "pointer", color: "#1a1a1a" }}>
              <span>{selectedSize}</span>
              <ChevronDown size={16} style={{ opacity: 0.5, transform: sizeOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
            </button>
            {sizeOpen && (
              <div className="absolute left-0 right-0 z-10" style={{ top: "calc(100% + 4px)", border: "1px solid rgba(26,26,26,0.15)", borderRadius: 8, background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                {SIZES.map(size => (
                  <button key={size} type="button" onClick={() => { setSelectedSize(size); setSizeOpen(false); }} className="w-full text-left flex items-center justify-between" style={{ padding: "12px 16px", fontSize: 14, cursor: "pointer", background: selectedSize === size ? "rgba(26,26,26,0.04)" : "transparent", border: 0, color: "#1a1a1a", fontWeight: selectedSize === size ? 500 : 400 }}>
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
          <div className="flex items-baseline gap-2" style={{ marginBottom: 8 }}>
            <legend style={{ fontWeight: 600, fontSize: 14 }}>Frame:</legend>
            <span style={{ fontWeight: 400, fontSize: 14 }}>{FRAMES.find(f => f.id === selectedFrame)?.label}</span>
          </div>
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            {FRAMES.map(frame => <FrameSwatch key={frame.id} frame={frame} selected={selectedFrame === frame.id} onClick={() => setSelectedFrame(frame.id)} />)}
          </div>
        </fieldset>

        {/* MOUNT — kept as split toggle since it's a core product option */}
        <SplitToggle label="Mount" value={mountSelected} onChange={setMountSelected} />

        {/* UPGRADES — compact stacked cards with checkboxes */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="flex items-baseline gap-2" style={{ marginBottom: 8 }}>
            <legend style={{ fontWeight: 600, fontSize: 14 }}>Upgrades:</legend>
            <span style={{ fontWeight: 400, fontSize: 13, color: "rgba(26,26,26,0.5)" }}>
              {[glazeSelected && "Museum Glaze", upgradeSelected && (isFramed ? "Box Frame" : "Photo Rag")].filter(Boolean).join(", ") || "None"}
            </span>
          </div>
          <div className="flex flex-col" style={{ gap: 8 }}>
            <UpgradeCard
              label="Museum Quality Glaze"
              price="+ £45.00"
              description="UV-protective, anti-reflective museum glass"
              active={glazeSelected}
              onClick={() => setGlazeSelected(!glazeSelected)}
            />
            <UpgradeCard
              label={isFramed ? "Black Box Frame" : "Hahnemuhle Photo Rag"}
              price={isFramed ? "+ £40.00" : "+ £15.00"}
              description={isFramed ? "Milled from solid Ash, hand-stained" : "Premium 308gsm cotton rag paper"}
              active={upgradeSelected}
              onClick={() => setUpgradeSelected(!upgradeSelected)}
              thumbnail={
                <div style={{
                  width: "100%", height: "100%",
                  background: isFramed
                    ? "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 60%, #333 100%)"
                    : "linear-gradient(135deg, #faf8f5 0%, #f5f0ea 50%, #ede5d8 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    width: 12, height: 16,
                    border: isFramed ? "2px solid #444" : "1px solid rgba(26,26,26,0.1)",
                    borderRadius: 1,
                    background: isFramed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)",
                  }} />
                </div>
              }
            />
          </div>
        </fieldset>

        {/* Price + CTA */}
        <div style={{ borderTop: "1px solid rgba(26,26,26,0.08)", paddingTop: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "rgba(26,26,26,0.5)" }}>
              {[FRAMES.find(f => f.id === selectedFrame)?.label, mountSelected && "Mount", glazeSelected && "Museum Glaze", upgradeSelected && (isFramed ? "Box Frame" : "Photo Rag")].filter(Boolean).join(" + ")}
            </span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>£{totalPrice.toFixed(2)}</span>
          </div>
          <button type="button" style={{ width: "100%", height: 54, background: "#1a1a1a", color: "#fff", border: 0, borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
