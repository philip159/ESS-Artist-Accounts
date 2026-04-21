import { useState } from "react";
import { ChevronDown, Check, Shield, Gem } from "lucide-react";

const SIZES = ['A4 - 8.27" x 11.67"', 'A3 - 11.69" x 16.54"', 'A2 - 16.54" x 23.39"'];
const FRAMES = [
  { id: "unframed", label: "Unframed", image: null },
  { id: "black", label: "Black Frame", image: "black" },
  { id: "white", label: "White Frame", image: "white" },
  { id: "natural", label: "Natural Frame", image: "natural" },
];

type ProductType = "print" | "canvas";
const R = 8; const TEXT = "#1a1a1a"; const SUB = "rgba(26,26,26,0.5)"; const FAINT = "rgba(26,26,26,0.4)"; const BORDER = "rgba(26,26,26,0.2)"; const BL = "rgba(26,26,26,0.12)";

function FrameSwatch({ frame, selected, onClick }: { frame: typeof FRAMES[0]; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ width: 52, height: 40, borderRadius: 6, border: "none", outline: "none", padding: 0, cursor: "pointer", overflow: "hidden", position: "relative", background: "#fff" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 6, border: selected ? `1.5px solid ${TEXT}` : `1px solid ${BL}`, pointerEvents: "none", zIndex: 2 }} />
      {frame.image ? (
        <div style={{ width: "100%", height: "100%", background: frame.id === "black" ? "linear-gradient(135deg, #2a2a2a, #1a1a1a, #333)" : frame.id === "white" ? "linear-gradient(135deg, #f5f5f5, #fff, #eee)" : "linear-gradient(135deg, #d4b896, #c4a87a, #e0c9a8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 16, height: 20, border: frame.id === "black" ? "2.5px solid #444" : frame.id === "white" ? "2.5px solid #ddd" : "2.5px solid #b8956a", borderRadius: 1, background: "rgba(255,255,255,0.15)" }} />
        </div>
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa" }}>
          <svg width="30" height="26" viewBox="0 0 40 36" fill="none" style={{ opacity: 0.3 }}><rect x="8" y="4" width="24" height="28" rx="1" stroke="currentColor" strokeWidth="1.5" /><line x1="6" y1="34" x2="34" y2="2" stroke="currentColor" strokeWidth="1" /></svg>
        </div>
      )}
    </button>
  );
}

function GridCell({ label, value, onClick, children }: { label: string; value: string; onClick?: () => void; children?: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="flex items-baseline gap-1" style={{ marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: TEXT }}>{label}:</span>
        <span style={{ fontSize: 12, color: TEXT }}>{value}</span>
      </div>
      {children}
    </div>
  );
}

export function CompactV3() {
  const [productType, setProductType] = useState<ProductType>("print");
  const [selectedSize, setSelectedSize] = useState(SIZES[0]);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState("black");
  const [mountSelected, setMountSelected] = useState(false);
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [upgradeSelected, setUpgradeSelected] = useState(false);
  const [upgradesOpen, setUpgradesOpen] = useState(false);

  const isCanvas = productType === "canvas";
  const isFramed = !isCanvas && selectedFrame !== "unframed";
  const upgradeCount = [glazeSelected, !isCanvas && upgradeSelected].filter(Boolean).length;

  const totalPrice = (() => {
    let p = isCanvas ? 45 : 25;
    if (isFramed) p += 30; if (!isCanvas && mountSelected) p += 10;
    if (glazeSelected) p += 45; if (upgradeSelected && !isCanvas) p += isFramed ? 40 : 15;
    return p;
  })();

  const summary = [isCanvas ? "Canvas" : FRAMES.find(f => f.id === selectedFrame)?.label, !isCanvas && mountSelected && "Mount", glazeSelected && "Museum Glaze", upgradeSelected && isFramed && "Box Frame", upgradeSelected && !isCanvas && !isFramed && "Photo Rag"].filter(Boolean).join(" + ");

  const segBtn = (active: boolean, side: "l" | "r"): React.CSSProperties => ({
    flex: 1, height: 38, border: `1px solid ${active ? TEXT : BORDER}`,
    borderRadius: side === "l" ? "6px 0 0 6px" : "0 6px 6px 0",
    background: active ? TEXT : "#fff", color: active ? "#fff" : SUB,
    fontWeight: 500, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
    marginLeft: side === "r" ? -1 : 0, position: "relative", zIndex: active ? 2 : 1,
  });

  return (
    <div className="min-h-screen p-5 sm:p-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#fff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 16 }}>

        {/* ROW 1: Type + Size side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <GridCell label="Type" value={isCanvas ? "Canvas" : "Print"}>
            <div className="flex">
              <button type="button" onClick={() => setProductType("print")} style={segBtn(!isCanvas, "l")}>Print</button>
              <button type="button" onClick={() => setProductType("canvas")} style={segBtn(isCanvas, "r")}>Canvas</button>
            </div>
          </GridCell>
          <GridCell label="Size" value={selectedSize.split(" - ")[0]}>
            <div className="relative">
              <button type="button" onClick={() => setSizeOpen(!sizeOpen)} className="w-full flex items-center justify-between" style={{ height: 38, padding: "0 10px", border: `1px solid ${BORDER}`, borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: TEXT }}>
                <span>{selectedSize.split(" - ")[0]}</span>
                <ChevronDown size={13} style={{ opacity: 0.5, transform: sizeOpen ? "rotate(180deg)" : "none" }} />
              </button>
              {sizeOpen && (
                <div className="absolute left-0 right-0 z-10" style={{ top: "calc(100% + 3px)", border: `1px solid ${BL}`, borderRadius: 6, background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                  {SIZES.map(s => (
                    <button key={s} type="button" onClick={() => { setSelectedSize(s); setSizeOpen(false); }} className="w-full text-left flex items-center justify-between" style={{ padding: "8px 10px", fontSize: 12, cursor: "pointer", background: selectedSize === s ? "rgba(26,26,26,0.04)" : "transparent", border: 0, color: TEXT, fontWeight: selectedSize === s ? 500 : 400 }}>
                      <span>{s}</span>
                      {selectedSize === s && <Check size={12} style={{ opacity: 0.5 }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </GridCell>
        </div>

        {/* ROW 2: Frame + Mount side by side */}
        {!isCanvas && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "end" }}>
            <GridCell label="Frame" value={FRAMES.find(f => f.id === selectedFrame)?.label || ""}>
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {FRAMES.map(f => <FrameSwatch key={f.id} frame={f} selected={selectedFrame === f.id} onClick={() => setSelectedFrame(f.id)} />)}
              </div>
            </GridCell>
            <GridCell label="Mount" value={mountSelected ? "Yes" : "No"}>
              <div className="flex" style={{ minWidth: 120 }}>
                <button type="button" onClick={() => setMountSelected(true)} style={{
                  flex: 1, height: 40, border: `1px solid ${mountSelected ? TEXT : BORDER}`,
                  borderRadius: "6px 0 0 6px",
                  background: mountSelected ? TEXT : "#fff", color: mountSelected ? "#fff" : SUB,
                  fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  position: "relative", zIndex: mountSelected ? 2 : 1,
                }}>Yes</button>
                <button type="button" onClick={() => setMountSelected(false)} style={{
                  flex: 1, height: 40, border: `1px solid ${!mountSelected ? TEXT : BORDER}`,
                  borderRadius: "0 6px 6px 0",
                  background: !mountSelected ? TEXT : "#fff", color: !mountSelected ? "#fff" : SUB,
                  fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  marginLeft: -1, position: "relative", zIndex: !mountSelected ? 2 : 1,
                }}>No</button>
              </div>
            </GridCell>
          </div>
        )}

        {/* ROW 3: Upgrades accordion */}
        <div>
          <div className="flex items-baseline gap-1" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: TEXT }}>Upgrades:</span>
            <span style={{ fontSize: 12, color: upgradeCount > 0 ? TEXT : SUB }}>{upgradeCount > 0 ? [glazeSelected && "Museum Glaze", upgradeSelected && !isCanvas && (isFramed ? "Box Frame" : "Photo Rag")].filter(Boolean).join(", ") : "None"}</span>
          </div>
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: R, overflow: "hidden" }}>
            <button type="button" onClick={() => setUpgradesOpen(!upgradesOpen)} className="w-full flex items-center justify-between" style={{ height: 38, padding: "0 12px", background: "#fff", border: 0, cursor: "pointer", fontFamily: "inherit", color: upgradeCount > 0 ? TEXT : SUB, fontSize: 12 }}>
              <span>{upgradeCount > 0 ? `${upgradeCount} selected` : "Add premium upgrades"}</span>
              <ChevronDown size={13} style={{ opacity: 0.5, transform: upgradesOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {upgradesOpen && (
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(26,26,26,0.06)" }}>
                <label className="flex items-center justify-between" style={{ cursor: "pointer", padding: "6px 0" }} onClick={() => setGlazeSelected(!glazeSelected)}>
                  <div><div className="flex items-baseline" style={{ gap: 4 }}><span style={{ fontWeight: 500, fontSize: 12 }}>Museum Quality Glaze</span><span style={{ fontSize: 11, color: FAINT }}>+ £45</span></div><span style={{ fontSize: 10.5, color: FAINT }}>UV-protective museum glass</span></div>
                  <div style={{ width: 16, height: 16, borderRadius: 3, border: glazeSelected ? "none" : `1.5px solid ${BORDER}`, background: glazeSelected ? TEXT : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 8 }}>{glazeSelected && <Check size={10} color="#fff" strokeWidth={3} />}</div>
                </label>
                {!isCanvas && (
                  <label className="flex items-center justify-between" style={{ cursor: "pointer", padding: "6px 0" }} onClick={() => setUpgradeSelected(!upgradeSelected)}>
                    <div><div className="flex items-baseline" style={{ gap: 4 }}><span style={{ fontWeight: 500, fontSize: 12 }}>{isFramed ? "Black Box Frame" : "Photo Rag"}</span><span style={{ fontSize: 11, color: FAINT }}>{isFramed ? "+ £40" : "+ £15"}</span></div><span style={{ fontSize: 10.5, color: FAINT }}>{isFramed ? "Solid Ash, hand-stained" : "308gsm cotton rag"}</span></div>
                    <div style={{ width: 16, height: 16, borderRadius: 3, border: upgradeSelected ? "none" : `1.5px solid ${BORDER}`, background: upgradeSelected ? TEXT : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 8 }}>{upgradeSelected && <Check size={10} color="#fff" strokeWidth={3} />}</div>
                  </label>
                )}
              </div>
            )}
          </div>
        </div>

        {/* PRICE + CTA */}
        <div style={{ borderTop: "1px solid rgba(26,26,26,0.08)", paddingTop: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: SUB }}>{summary}</span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>£{totalPrice.toFixed(2)}</span>
          </div>
          <button type="button" style={{ width: "100%", height: 50, background: TEXT, color: "#fff", border: 0, borderRadius: R, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>Add to Cart</button>
        </div>
      </div>
    </div>
  );
}
