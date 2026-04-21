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

function StepRow({ number, label, value, done, active, onClick, children }: {
  number: number; label: string; value: string; done: boolean; active: boolean; onClick: () => void; children?: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid rgba(26,26,26,0.06)" }}>
      <button type="button" onClick={onClick} className="w-full flex items-center text-left" style={{
        padding: "12px 0", background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", gap: 12,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 14, flexShrink: 0,
          background: done ? TEXT : active ? "#fff" : "#fafafa",
          border: done ? "none" : `1.5px solid ${active ? TEXT : BL}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 600,
          color: done ? "#fff" : active ? TEXT : SUB,
          transition: "all 0.15s",
        }}>
          {done ? <Check size={14} strokeWidth={2.5} /> : number}
        </div>
        <div className="flex-1 min-w-0">
          <span style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{label}</span>
          {!active && <span style={{ fontSize: 13, color: SUB, marginLeft: 6 }}>{value}</span>}
        </div>
        {!active && <ChevronDown size={14} style={{ opacity: 0.3, transform: "rotate(-90deg)", flexShrink: 0 }} />}
      </button>
      {active && <div style={{ padding: "0 0 16px 40px" }}>{children}</div>}
    </div>
  );
}

export function CompactV5() {
  const [productType, setProductType] = useState<ProductType>("print");
  const [selectedSize, setSelectedSize] = useState(SIZES[0]);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState("black");
  const [mountSelected, setMountSelected] = useState(false);
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [upgradeSelected, setUpgradeSelected] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const isCanvas = productType === "canvas";
  const isFramed = !isCanvas && selectedFrame !== "unframed";

  const totalPrice = (() => {
    let p = isCanvas ? 45 : 25;
    if (isFramed) p += 30; if (!isCanvas && mountSelected) p += 10;
    if (glazeSelected) p += 45; if (upgradeSelected && !isCanvas) p += isFramed ? 40 : 15;
    return p;
  })();

  const summary = [isCanvas ? "Canvas" : FRAMES.find(f => f.id === selectedFrame)?.label, !isCanvas && mountSelected && "Mount", glazeSelected && "Museum Glaze", upgradeSelected && isFramed && "Box Frame", upgradeSelected && !isCanvas && !isFramed && "Photo Rag"].filter(Boolean).join(" + ");

  const steps = isCanvas
    ? [
        { label: "Type", value: "Canvas" },
        { label: "Size", value: selectedSize.split(" - ")[0] },
        { label: "Upgrades", value: glazeSelected ? "Museum Glaze" : "None" },
      ]
    : [
        { label: "Type", value: "Print" },
        { label: "Size", value: selectedSize.split(" - ")[0] },
        { label: "Frame", value: FRAMES.find(f => f.id === selectedFrame)?.label || "" },
        { label: "Mount", value: mountSelected ? "Yes" : "No" },
        { label: "Upgrades", value: [glazeSelected && "Glaze", upgradeSelected && (isFramed ? "Box Frame" : "Photo Rag")].filter(Boolean).join(", ") || "None" },
      ];

  return (
    <div className="min-h-screen p-5 sm:p-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#fff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 0 }}>

        {/* STEPPER */}
        <div style={{ marginBottom: 16 }}>
          {steps.map((s, i) => (
            <StepRow key={s.label} number={i + 1} label={s.label} value={s.value} done={i < activeStep} active={i === activeStep} onClick={() => setActiveStep(i)}>
              {/* TYPE */}
              {s.label === "Type" && (
                <div className="flex" style={{ gap: 0 }}>
                  {(["print", "canvas"] as ProductType[]).map(t => (
                    <button key={t} type="button" onClick={() => { setProductType(t); setActiveStep(1); }} style={{
                      flex: 1, height: 38, border: `1px solid ${productType === t ? TEXT : BORDER}`,
                      borderRadius: t === "print" ? "6px 0 0 6px" : "0 6px 6px 0",
                      background: productType === t ? TEXT : "#fff", color: productType === t ? "#fff" : SUB,
                      fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                      marginLeft: t === "canvas" ? -1 : 0, position: "relative", zIndex: productType === t ? 2 : 1,
                    }}>{t === "print" ? "Print" : "Canvas"}</button>
                  ))}
                </div>
              )}

              {/* SIZE */}
              {s.label === "Size" && (
                <div className="flex flex-col" style={{ gap: 0 }}>
                  {SIZES.map(sz => (
                    <button key={sz} type="button" onClick={() => { setSelectedSize(sz); setActiveStep(activeStep + 1); }} className="w-full text-left flex items-center justify-between" style={{ padding: "8px 0", fontSize: 13, cursor: "pointer", background: "transparent", border: 0, color: TEXT, fontWeight: selectedSize === sz ? 500 : 400 }}>
                      <span>{sz}</span>
                      {selectedSize === sz && <Check size={13} style={{ opacity: 0.5 }} />}
                    </button>
                  ))}
                </div>
              )}

              {/* FRAME */}
              {s.label === "Frame" && (
                <div className="flex flex-wrap" style={{ gap: 8 }}>
                  {FRAMES.map(f => <FrameSwatch key={f.id} frame={f} selected={selectedFrame === f.id} onClick={() => setSelectedFrame(f.id)} />)}
                </div>
              )}

              {/* MOUNT */}
              {s.label === "Mount" && (
                <div className="flex" style={{ gap: 0, maxWidth: 200 }}>
                  {[true, false].map(v => (
                    <button key={String(v)} type="button" onClick={() => { setMountSelected(v); setActiveStep(activeStep + 1); }} style={{
                      flex: 1, height: 38, border: `1px solid ${mountSelected === v ? TEXT : BORDER}`,
                      borderRadius: v ? "6px 0 0 6px" : "0 6px 6px 0",
                      background: mountSelected === v ? TEXT : "#fff", color: mountSelected === v ? "#fff" : SUB,
                      fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                      marginLeft: !v ? -1 : 0, position: "relative", zIndex: mountSelected === v ? 2 : 1,
                    }}>{v ? "Yes" : "No"}</button>
                  ))}
                </div>
              )}

              {/* UPGRADES */}
              {s.label === "Upgrades" && (
                <div className="flex flex-col" style={{ gap: 8 }}>
                  <label className="flex items-center justify-between" style={{ cursor: "pointer" }} onClick={() => setGlazeSelected(!glazeSelected)}>
                    <div><div className="flex items-baseline" style={{ gap: 4 }}><span style={{ fontWeight: 500, fontSize: 13 }}>Museum Glaze</span><span style={{ fontSize: 12, color: FAINT }}>+ £45</span></div><span style={{ fontSize: 11, color: FAINT }}>UV-protective museum glass</span></div>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: glazeSelected ? "none" : `1.5px solid ${BORDER}`, background: glazeSelected ? TEXT : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 10 }}>{glazeSelected && <Check size={11} color="#fff" strokeWidth={3} />}</div>
                  </label>
                  {!isCanvas && (
                    <label className="flex items-center justify-between" style={{ cursor: "pointer" }} onClick={() => setUpgradeSelected(!upgradeSelected)}>
                      <div><div className="flex items-baseline" style={{ gap: 4 }}><span style={{ fontWeight: 500, fontSize: 13 }}>{isFramed ? "Box Frame" : "Photo Rag"}</span><span style={{ fontSize: 12, color: FAINT }}>{isFramed ? "+ £40" : "+ £15"}</span></div><span style={{ fontSize: 11, color: FAINT }}>{isFramed ? "Solid Ash, hand-stained" : "308gsm cotton rag"}</span></div>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: upgradeSelected ? "none" : `1.5px solid ${BORDER}`, background: upgradeSelected ? TEXT : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 10 }}>{upgradeSelected && <Check size={11} color="#fff" strokeWidth={3} />}</div>
                    </label>
                  )}
                </div>
              )}
            </StepRow>
          ))}
        </div>

        {/* PRICE + CTA */}
        <div style={{ borderTop: "1px solid rgba(26,26,26,0.08)", paddingTop: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: SUB }}>{summary}</span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>£{totalPrice.toFixed(2)}</span>
          </div>
          <button type="button" style={{ width: "100%", height: 50, background: TEXT, color: "#fff", border: 0, borderRadius: R, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>Add to Cart</button>
        </div>
      </div>
    </div>
  );
}
