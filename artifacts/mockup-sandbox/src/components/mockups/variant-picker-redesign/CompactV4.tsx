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

function PremiumUpgradeCard({ title, price, headline, details, checked, onClick, icon, thumbnail }: {
  title: string; price: string; headline: string; details: string; checked: boolean; onClick: () => void; icon: React.ReactNode; thumbnail?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left" style={{ padding: 0, borderRadius: R, border: `1px solid ${checked ? TEXT : BL}`, background: "#fff", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", overflow: "hidden" }}>
      <div className="flex items-start" style={{ padding: "12px 12px 0", gap: 10 }}>
        {thumbnail}
        <div className="flex-1 min-w-0">
          <span style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{title}</span>
          <p style={{ fontSize: 11.5, color: TEXT, lineHeight: 1.4, margin: "2px 0 0", opacity: 0.65 }}>{headline}</p>
        </div>
        <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1, border: checked ? "none" : `1.5px solid ${BORDER}`, background: checked ? TEXT : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {checked && <Check size={11} color="#fff" strokeWidth={3} />}
        </div>
      </div>
      <div style={{ margin: "8px 12px 0", padding: "8px 0 10px", borderTop: "1px solid rgba(26,26,26,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="flex items-center" style={{ gap: 4 }}><span style={{ opacity: 0.3, display: "flex" }}>{icon}</span><span style={{ fontSize: 10.5, color: FAINT }}>{details}</span></div>
        <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, opacity: 0.8 }}>{price}</span>
      </div>
    </button>
  );
}

export function CompactV4() {
  const [productType, setProductType] = useState<ProductType>("print");
  const [selectedSize, setSelectedSize] = useState(SIZES[0]);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState("black");
  const [mountSelected, setMountSelected] = useState(false);
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [upgradeSelected, setUpgradeSelected] = useState(false);
  const [step, setStep] = useState(0);

  const isCanvas = productType === "canvas";
  const isFramed = !isCanvas && selectedFrame !== "unframed";

  const totalPrice = (() => {
    let p = isCanvas ? 45 : 25;
    if (isFramed) p += 30; if (!isCanvas && mountSelected) p += 10;
    if (glazeSelected) p += 45; if (upgradeSelected && !isCanvas) p += isFramed ? 40 : 15;
    return p;
  })();

  const summary = [isCanvas ? "Canvas" : FRAMES.find(f => f.id === selectedFrame)?.label, !isCanvas && mountSelected && "Mount", glazeSelected && "Museum Glaze", upgradeSelected && isFramed && "Box Frame", upgradeSelected && !isCanvas && !isFramed && "Photo Rag"].filter(Boolean).join(" + ");

  const maxStep = isCanvas ? 1 : 3;
  const canContinue = step < maxStep;

  const stepLabels = isCanvas
    ? ["Size", "Upgrades"]
    : ["Size", "Frame", "Mount", "Upgrades"];

  return (
    <div className="min-h-screen p-5 sm:p-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#fff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 16 }}>

        {/* TYPE — always visible */}
        <div>
          <div className="flex items-baseline gap-1" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Type:</span>
            <span style={{ fontSize: 13 }}>{isCanvas ? "Canvas" : "Print"}</span>
          </div>
          <div className="flex">
            {(["print", "canvas"] as ProductType[]).map(t => (
              <button key={t} type="button" onClick={() => { setProductType(t); setStep(0); }} style={{
                flex: 1, height: 40, border: `1px solid ${productType === t ? TEXT : BORDER}`,
                borderRadius: t === "print" ? "6px 0 0 6px" : "0 6px 6px 0",
                background: productType === t ? TEXT : "#fff", color: productType === t ? "#fff" : SUB,
                fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                marginLeft: t === "canvas" ? -1 : 0, position: "relative", zIndex: productType === t ? 2 : 1,
              }}>{t === "print" ? "Print" : "Canvas"}</button>
            ))}
          </div>
        </div>

        {/* PROGRESS DOTS */}
        <div className="flex items-center justify-center" style={{ gap: 6 }}>
          {stepLabels.map((l, i) => (
            <button key={l} type="button" onClick={() => setStep(i)} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 4,
              background: i <= step ? TEXT : "rgba(26,26,26,0.12)",
              border: 0, cursor: "pointer", transition: "all 0.2s", padding: 0,
            }} />
          ))}
        </div>

        {/* CURRENT STEP */}
        <div style={{ minHeight: 80 }}>
          {/* SIZE */}
          {((isCanvas && step === 0) || (!isCanvas && step === 0)) && (
            <div>
              <div className="flex items-baseline gap-1" style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Size:</span>
                <span style={{ fontSize: 13 }}>{selectedSize}</span>
              </div>
              <div className="relative">
                <button type="button" onClick={() => setSizeOpen(!sizeOpen)} className="w-full flex items-center justify-between" style={{ height: 44, padding: "0 14px", border: `1px solid ${BORDER}`, borderRadius: R, background: "#fff", fontSize: 13, cursor: "pointer", color: TEXT }}>
                  <span>{selectedSize}</span>
                  <ChevronDown size={14} style={{ opacity: 0.5, transform: sizeOpen ? "rotate(180deg)" : "none" }} />
                </button>
                {sizeOpen && (
                  <div className="absolute left-0 right-0 z-10" style={{ top: "calc(100% + 3px)", border: `1px solid ${BL}`, borderRadius: R, background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                    {SIZES.map(s => (
                      <button key={s} type="button" onClick={() => { setSelectedSize(s); setSizeOpen(false); }} className="w-full text-left flex items-center justify-between" style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", background: selectedSize === s ? "rgba(26,26,26,0.04)" : "transparent", border: 0, color: TEXT, fontWeight: selectedSize === s ? 500 : 400 }}>
                        <span>{s}</span>{selectedSize === s && <Check size={13} style={{ opacity: 0.5 }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FRAME */}
          {!isCanvas && step === 1 && (
            <div>
              <div className="flex items-baseline gap-1" style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Frame:</span>
                <span style={{ fontSize: 13 }}>{FRAMES.find(f => f.id === selectedFrame)?.label}</span>
              </div>
              <div className="flex flex-wrap" style={{ gap: 8 }}>
                {FRAMES.map(f => <FrameSwatch key={f.id} frame={f} selected={selectedFrame === f.id} onClick={() => setSelectedFrame(f.id)} />)}
              </div>
            </div>
          )}

          {/* MOUNT */}
          {!isCanvas && step === 2 && (
            <div>
              <div className="flex items-baseline gap-1" style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Mount:</span>
                <span style={{ fontSize: 13 }}>{mountSelected ? "Yes" : "No"}</span>
              </div>
              <div className="flex">
                {[true, false].map(v => (
                  <button key={String(v)} type="button" onClick={() => setMountSelected(v)} style={{
                    flex: 1, height: 44, border: `1px solid ${mountSelected === v ? TEXT : BORDER}`,
                    borderRadius: v ? "8px 0 0 8px" : "0 8px 8px 0",
                    background: mountSelected === v ? TEXT : "#fff", color: mountSelected === v ? "#fff" : SUB,
                    fontWeight: 500, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                    marginLeft: !v ? -1 : 0, position: "relative", zIndex: mountSelected === v ? 2 : 1,
                  }}>{v ? "Yes" : "No"}</button>
                ))}
              </div>
            </div>
          )}

          {/* UPGRADES */}
          {((isCanvas && step === 1) || (!isCanvas && step === 3)) && (
            <div className="flex flex-col" style={{ gap: 8 }}>
              <PremiumUpgradeCard title="Museum Quality Glaze" price="+ £45" headline="Anti-reflective, UV-filtering museum glass. Preserves colours 100+ years." details="Used by the National Gallery" checked={glazeSelected} onClick={() => setGlazeSelected(!glazeSelected)} icon={<Shield size={11} />} thumbnail={<div style={{ width: 40, height: 40, borderRadius: 5, background: "linear-gradient(145deg, rgba(200,220,240,0.3), rgba(255,255,255,0.5))", border: "1px solid rgba(26,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><div style={{ width: 18, height: 24, borderRadius: 1, background: "linear-gradient(180deg, rgba(255,255,255,0.9), rgba(240,245,250,0.8))", border: "1px solid rgba(26,26,26,0.06)" }} /></div>} />
              {!isCanvas && <PremiumUpgradeCard title={isFramed ? "Black Box Frame" : "Hahnemuhle Photo Rag"} price={isFramed ? "+ £40" : "+ £15"} headline={isFramed ? "Solid Ash, deep 32mm profile. Hand-stained." : "308gsm cotton rag. Gold standard for fine art."} details={isFramed ? "Handcrafted in London" : "Trusted since 1584"} checked={upgradeSelected} onClick={() => setUpgradeSelected(!upgradeSelected)} icon={<Gem size={11} />} thumbnail={<div style={{ width: 40, height: 40, borderRadius: 5, border: "1px solid rgba(26,26,26,0.08)", background: isFramed ? "linear-gradient(135deg, #2a2a2a, #333)" : "linear-gradient(145deg, #faf8f5, #ede5d8)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><div style={{ width: isFramed ? 14 : 18, height: isFramed ? 18 : 24, border: isFramed ? "2px solid #444" : "1px solid rgba(26,26,26,0.08)", borderRadius: 1, background: isFramed ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)" }} /></div>} />}
            </div>
          )}
        </div>

        {/* NAV + PRICE */}
        <div style={{ borderTop: "1px solid rgba(26,26,26,0.08)", paddingTop: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: SUB }}>{summary}</span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>£{totalPrice.toFixed(2)}</span>
          </div>
          {canContinue ? (
            <div className="flex" style={{ gap: 8 }}>
              {step > 0 && <button type="button" onClick={() => setStep(step - 1)} style={{ flex: "0 0 auto", height: 50, padding: "0 20px", background: "#fff", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: R, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Back</button>}
              <button type="button" onClick={() => setStep(step + 1)} style={{ flex: 1, height: 50, background: TEXT, color: "#fff", border: 0, borderRadius: R, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>Continue</button>
            </div>
          ) : (
            <div className="flex" style={{ gap: 8 }}>
              <button type="button" onClick={() => setStep(step - 1)} style={{ flex: "0 0 auto", height: 50, padding: "0 20px", background: "#fff", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: R, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
              <button type="button" style={{ flex: 1, height: 50, background: TEXT, color: "#fff", border: 0, borderRadius: R, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>Add to Cart</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
