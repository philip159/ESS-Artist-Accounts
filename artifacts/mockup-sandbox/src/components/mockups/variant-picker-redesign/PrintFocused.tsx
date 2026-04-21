import { useState } from "react";
import { ChevronDown, Check, Shield, Gem } from "lucide-react";

const SIZES = ['A4 - 8.27" x 11.67"', 'A3 - 11.69" x 16.54"', 'A2 - 16.54" x 23.39"'];
const FRAMES = [
  { id: "unframed", label: "Unframed", image: null },
  { id: "black", label: "Black Frame", image: "black" },
  { id: "white", label: "White Frame", image: "white" },
  { id: "natural", label: "Natural Frame", image: "natural" },
];

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

function GridCell({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="flex items-baseline gap-1" style={{ marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{label}:</span>
        <span style={{ fontSize: 13, color: TEXT }}>{value}</span>
      </div>
      {children}
    </div>
  );
}

export function PrintFocused() {
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

  const summary = [
    FRAMES.find(f => f.id === selectedFrame)?.label,
    mountSelected && "Mount",
    glazeSelected && "Museum Glaze",
    upgradeSelected && (isFramed ? "Box Frame" : "Photo Rag"),
  ].filter(Boolean).join(" + ");

  return (
    <div className="min-h-screen p-5 sm:p-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#fff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 18 }}>

        {/* SIZE */}
        <GridCell label="Size" value={selectedSize}>
          <div className="relative">
            <button type="button" onClick={() => setSizeOpen(!sizeOpen)} className="w-full flex items-center justify-between" style={{ height: 42, padding: "0 14px", border: `1px solid ${BORDER}`, borderRadius: R, background: "#fff", fontSize: 13, cursor: "pointer", color: TEXT }}>
              <span>{selectedSize}</span>
              <ChevronDown size={14} style={{ opacity: 0.5, transform: sizeOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {sizeOpen && (
              <div className="absolute left-0 right-0 z-10" style={{ top: "calc(100% + 3px)", border: `1px solid ${BL}`, borderRadius: R, background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                {SIZES.map(s => (
                  <button key={s} type="button" onClick={() => { setSelectedSize(s); setSizeOpen(false); }} className="w-full text-left flex items-center justify-between" style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", background: selectedSize === s ? "rgba(26,26,26,0.04)" : "transparent", border: 0, color: TEXT, fontWeight: selectedSize === s ? 500 : 400 }}>
                    <span>{s}</span>
                    {selectedSize === s && <Check size={13} style={{ opacity: 0.5 }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </GridCell>

        {/* FRAME + MOUNT — same row, separate labeled sections */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "end" }}>
          <GridCell label="Frame" value={FRAMES.find(f => f.id === selectedFrame)?.label || ""}>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {FRAMES.map(f => <FrameSwatch key={f.id} frame={f} selected={selectedFrame === f.id} onClick={() => setSelectedFrame(f.id)} />)}
            </div>
          </GridCell>
          <GridCell label="Mount" value={mountSelected ? "Yes" : "No"}>
            <div className="flex" style={{ minWidth: 160 }}>
              <button type="button" onClick={() => setMountSelected(!mountSelected)} className="rounded-md sm:rounded-l-md sm:rounded-r-none" style={{
                flex: 1, height: 40, border: `1px solid ${mountSelected ? TEXT : BORDER}`,
                background: mountSelected ? TEXT : "#fff", color: mountSelected ? "#fff" : SUB,
                fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                position: "relative", zIndex: mountSelected ? 2 : 1,
              }}>Yes</button>
              <button type="button" onClick={() => setMountSelected(false)} className="hidden sm:flex" style={{
                flex: 1, height: 40, border: `1px solid ${!mountSelected ? TEXT : BORDER}`,
                borderRadius: "0 6px 6px 0",
                background: !mountSelected ? TEXT : "#fff", color: !mountSelected ? "#fff" : SUB,
                fontWeight: 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                marginLeft: -1, position: "relative", zIndex: !mountSelected ? 2 : 1,
                alignItems: "center", justifyContent: "center",
              }}>No</button>
            </div>
          </GridCell>
        </div>

        {/* UPGRADES — accordion */}
        <div>
          <div className="flex items-baseline gap-1" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>Upgrades:</span>
            <span style={{ fontSize: 13, color: upgradeCount > 0 ? TEXT : SUB }}>
              {upgradeCount > 0
                ? [glazeSelected && "Museum Glaze", upgradeSelected && (isFramed ? "Box Frame" : "Photo Rag")].filter(Boolean).join(", ")
                : "None"
              }
            </span>
          </div>
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: R, overflow: "hidden" }}>
            <button type="button" onClick={() => setUpgradesOpen(!upgradesOpen)} className="w-full flex items-center justify-between" style={{
              height: 42, padding: "0 14px", background: "#fff", border: 0, cursor: "pointer",
              fontFamily: "inherit", color: upgradeCount > 0 ? TEXT : SUB, fontSize: 13,
            }}>
              <div className="flex items-center" style={{ gap: 6 }}>
                <span>{upgradeCount > 0 ? `${upgradeCount} upgrade${upgradeCount > 1 ? "s" : ""} selected` : "Add premium upgrades"}</span>
                {upgradeCount > 0 && !upgradesOpen && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: TEXT, color: "#fff", borderRadius: 8, padding: "1px 6px" }}>{upgradeCount}</span>
                )}
              </div>
              <ChevronDown size={14} style={{ opacity: 0.5, transform: upgradesOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {upgradesOpen && (
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid rgba(26,26,26,0.06)` }}>
                {/* Museum Quality Glaze card — V5a style */}
                <button type="button" onClick={() => setGlazeSelected(!glazeSelected)} style={{
                  display: "flex", flexDirection: "column", gap: 0, padding: 0, width: "100%",
                  border: `1.5px solid ${glazeSelected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
                  background: glazeSelected ? "rgba(26,26,26,0.02)" : "#fff",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
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
                      <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>Museum Grade Glaze</span>
                        <span style={{ fontSize: 11, color: FAINT }}>+ £45</span>
                      </div>
                      <span style={{ fontSize: 11.5, color: SUB, lineHeight: 1.45, display: "block" }}>
                        Nano-structured acrylic used in galleries worldwide. Virtually eliminates reflections so you see the artwork, not the glass.
                      </span>
                    </div>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: glazeSelected ? "none" : `1.5px solid ${BORDER}`,
                      background: glazeSelected ? TEXT : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {glazeSelected && <Check size={13} color="#fff" strokeWidth={2.5} />}
                    </div>
                  </div>
                  <div style={{
                    padding: "8px 14px 10px", borderTop: "1px solid rgba(26,26,26,0.04)",
                    display: "flex", gap: 12, flexWrap: "wrap",
                  }}>
                    <span style={{ fontSize: 10, color: FAINT }}>99% UV protection</span>
                    <span style={{ fontSize: 10, color: "rgba(26,26,26,0.15)" }}>|</span>
                    <span style={{ fontSize: 10, color: FAINT }}>&lt;1% reflection</span>
                    <span style={{ fontSize: 10, color: "rgba(26,26,26,0.15)" }}>|</span>
                    <span style={{ fontSize: 10, color: FAINT }}>Shatter-resistant</span>
                  </div>
                </button>

                {/* Frame / Paper upgrade card — V5a style */}
                <button type="button" onClick={() => setUpgradeSelected(!upgradeSelected)} style={{
                  display: "flex", flexDirection: "column", gap: 0, padding: 0, width: "100%",
                  border: `1.5px solid ${upgradeSelected ? TEXT : BL}`, borderRadius: R, overflow: "hidden",
                  background: upgradeSelected ? "rgba(26,26,26,0.02)" : "#fff",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  transition: "all 0.2s",
                  boxShadow: upgradeSelected ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14 }}>
                    <div style={{
                      width: 56, height: 48, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                      background: isFramed
                        ? "linear-gradient(145deg, #333, #1a1a1a, #2a2a2a)"
                        : "linear-gradient(145deg, #f5f0ea, #ede5d8, #e5dcc8)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isFramed ? (
                        <div style={{ width: 18, height: 22, border: "3px solid #555", borderRadius: 1, background: "rgba(255,255,255,0.06)" }} />
                      ) : (
                        <div style={{ width: 22, height: 26, borderRadius: 1, background: "rgba(255,255,255,0.65)", border: "1px solid rgba(26,26,26,0.06)" }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{isFramed ? "Black Box Frame" : "Hahnemuhle Photo Rag"}</span>
                        <span style={{ fontSize: 11, color: FAINT }}>+ {isFramed ? "£40" : "£15"}</span>
                      </div>
                      <span style={{ fontSize: 11.5, color: SUB, lineHeight: 1.45, display: "block" }}>
                        {isFramed
                          ? "Hand-stained solid Ash with a deep shadow-box profile. Creates the floating effect seen in professional galleries."
                          : "Premium 308gsm cotton rag by Hahnemuhle. Exceptional detail and colour depth for fine art reproduction."}
                      </span>
                    </div>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: upgradeSelected ? "none" : `1.5px solid ${BORDER}`,
                      background: upgradeSelected ? TEXT : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {upgradeSelected && <Check size={13} color="#fff" strokeWidth={2.5} />}
                    </div>
                  </div>
                  <div style={{
                    padding: "8px 14px 10px", borderTop: "1px solid rgba(26,26,26,0.04)",
                    display: "flex", gap: 12, flexWrap: "wrap",
                  }}>
                    {isFramed ? (<>
                      <span style={{ fontSize: 10, color: FAINT }}>Solid Ash hardwood</span>
                      <span style={{ fontSize: 10, color: "rgba(26,26,26,0.15)" }}>|</span>
                      <span style={{ fontSize: 10, color: FAINT }}>45mm deep profile</span>
                      <span style={{ fontSize: 10, color: "rgba(26,26,26,0.15)" }}>|</span>
                      <span style={{ fontSize: 10, color: FAINT }}>Hand-stained</span>
                    </>) : (<>
                      <span style={{ fontSize: 10, color: FAINT }}>308gsm weight</span>
                      <span style={{ fontSize: 10, color: "rgba(26,26,26,0.15)" }}>|</span>
                      <span style={{ fontSize: 10, color: FAINT }}>100% cotton rag</span>
                      <span style={{ fontSize: 10, color: "rgba(26,26,26,0.15)" }}>|</span>
                      <span style={{ fontSize: 10, color: FAINT }}>Archival quality</span>
                    </>)}
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PRICE + CTA */}
        <div style={{ borderTop: "1px solid rgba(26,26,26,0.08)", paddingTop: 16 }}>
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
