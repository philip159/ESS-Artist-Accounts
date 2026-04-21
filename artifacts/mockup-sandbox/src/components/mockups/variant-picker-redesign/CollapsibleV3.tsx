import { useState } from "react";
import { ChevronDown, Check, Shield, Gem } from "lucide-react";

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

type ProductType = "print" | "canvas";

const INPUT_H = 50;
const R = 8;
const FS = 14;
const TEXT = "#1a1a1a";
const SUB = "rgba(26,26,26,0.5)";
const FAINT = "rgba(26,26,26,0.4)";
const BORDER = "rgba(26,26,26,0.2)";
const BORDER_LIGHT = "rgba(26,26,26,0.12)";
const PANEL_PAD = 12;

function TypeSwatch({ label, selected, onClick, children }: {
  label: string; selected: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center" style={{
      gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
    }}>
      <div style={{
        width: 80, height: 60, borderRadius: R, border: "none", outline: "none",
        overflow: "hidden", position: "relative", background: "#fff", boxSizing: "border-box",
      }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: R,
          border: selected ? `1.5px solid ${TEXT}` : `1px solid ${BORDER_LIGHT}`,
          pointerEvents: "none", zIndex: 2, transition: "border-color 0.15s",
        }} />
        <div style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#fafafa",
        }}>
          {children}
        </div>
      </div>
      <span style={{
        fontSize: 12, fontWeight: selected ? 600 : 400,
        color: selected ? TEXT : SUB, transition: "all 0.15s",
      }}>{label}</span>
    </button>
  );
}

function FrameSwatch({ frame, selected, onClick }: { frame: typeof FRAMES[0]; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ width: 66, height: INPUT_H, borderRadius: R, border: "none", outline: "none", padding: 0, cursor: "pointer", overflow: "hidden", position: "relative", background: "#fff", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: R, border: selected ? `1.5px solid ${TEXT}` : `1px solid ${BORDER_LIGHT}`, pointerEvents: "none", zIndex: 2, transition: "border-color 0.15s" }} />
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

function Label({ text, value }: { text: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2" style={{ marginBottom: 8 }}>
      <span style={{ fontWeight: 600, fontSize: FS, color: TEXT }}>{text}:</span>
      <span style={{ fontWeight: 400, fontSize: FS, color: TEXT }}>{value}</span>
    </div>
  );
}

function MountSwatch({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: 66, height: INPUT_H, borderRadius: R, border: "none", outline: "none",
      padding: 0, cursor: "pointer", overflow: "hidden", position: "relative",
      background: "#fff", boxSizing: "border-box",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: R,
        border: selected ? `1.5px solid ${TEXT}` : `1px solid ${BORDER_LIGHT}`,
        pointerEvents: "none", zIndex: 2, transition: "border-color 0.15s",
      }} />
      <div style={{
        width: "100%", height: "100%", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#fafafa",
      }}>
        <div style={{ position: "relative", width: 28, height: 34 }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "#fff",
            border: "1px solid rgba(26,26,26,0.1)",
            borderRadius: 1,
          }} />
          <div style={{
            position: "absolute",
            top: 4, left: 4, right: 4, bottom: 4,
            background: "rgba(26,26,26,0.06)",
            borderRadius: 0,
          }} />
        </div>
      </div>
    </button>
  );
}

function NoMountSwatch({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: 66, height: INPUT_H, borderRadius: R, border: "none", outline: "none",
      padding: 0, cursor: "pointer", overflow: "hidden", position: "relative",
      background: "#fff", boxSizing: "border-box",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: R,
        border: selected ? `1.5px solid ${TEXT}` : `1px solid ${BORDER_LIGHT}`,
        pointerEvents: "none", zIndex: 2, transition: "border-color 0.15s",
      }} />
      <div style={{
        width: "100%", height: "100%", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#fafafa",
      }}>
        <div style={{
          width: 24, height: 30,
          background: "rgba(26,26,26,0.06)",
          border: "1px solid rgba(26,26,26,0.1)",
          borderRadius: 1,
        }} />
      </div>
    </button>
  );
}

function PremiumUpgradeCard({
  title, price, headline, details, checked, onClick, icon, thumbnail,
}: {
  title: string; price: string; headline: string; details: string;
  checked: boolean; onClick: () => void;
  icon: React.ReactNode; thumbnail?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left"
      style={{
        padding: 0,
        borderRadius: R,
        border: `1px solid ${checked ? TEXT : BORDER_LIGHT}`,
        background: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.2s",
        overflow: "hidden",
      }}
    >
      <div className="flex items-start" style={{ padding: "14px 14px 0 14px", gap: 12 }}>
        {thumbnail && (
          <div style={{ flexShrink: 0 }}>{thumbnail}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center" style={{ gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: TEXT, letterSpacing: "0.01em" }}>{title}</span>
          </div>
          <p style={{ fontSize: 12, color: TEXT, lineHeight: 1.4, margin: 0, fontWeight: 400, opacity: 0.7 }}>
            {headline}
          </p>
        </div>
        <div style={{
          width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 1,
          border: checked ? "none" : `1.5px solid ${BORDER}`,
          background: checked ? TEXT : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}>
          {checked && <Check size={12} color="#fff" strokeWidth={3} />}
        </div>
      </div>

      <div style={{
        margin: "10px 14px 0",
        padding: "10px 0 14px",
        borderTop: "1px solid rgba(26,26,26,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div className="flex items-center" style={{ gap: 5 }}>
          <span style={{ opacity: 0.3, display: "flex" }}>{icon}</span>
          <span style={{ fontSize: 11, color: FAINT, lineHeight: 1.3 }}>{details}</span>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600, color: TEXT, whiteSpace: "nowrap",
          opacity: 0.8,
        }}>{price}</span>
      </div>
    </button>
  );
}

export function CollapsibleV3() {
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
  const upgradeCount = [glazeSelected, upgradeSelected].filter(Boolean).length;

  const totalPrice = (() => {
    let p = isCanvas ? 45 : 25;
    if (!isCanvas && isFramed) p += 30;
    if (!isCanvas && mountSelected) p += 10;
    if (glazeSelected) p += 45;
    if (upgradeSelected) p += isFramed ? 40 : isCanvas ? 0 : 15;
    return p;
  })();

  const summaryParts = [
    isCanvas ? "Canvas" : FRAMES.find(f => f.id === selectedFrame)?.label,
    !isCanvas && mountSelected && "Mount",
    glazeSelected && "Museum Glaze",
    upgradeSelected && isFramed && "Box Frame",
    upgradeSelected && !isCanvas && !isFramed && "Photo Rag",
  ].filter(Boolean);

  return (
    <div className="min-h-screen p-6 sm:p-8" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: TEXT, background: "#fff" }}>
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: 24 }}>

        {/* PRODUCT TYPE — top-level choice */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <Label text="Type" value={isCanvas ? "Canvas" : "Print"} />
          <div className="flex" style={{ gap: 16 }}>
            <TypeSwatch label="Print" selected={productType === "print"} onClick={() => setProductType("print")}>
              <div style={{ position: "relative" }}>
                <div style={{
                  width: 30, height: 38, borderRadius: 1,
                  background: "rgba(26,26,26,0.05)",
                  border: "1px solid rgba(26,26,26,0.1)",
                }} />
                <div style={{
                  position: "absolute", inset: -3,
                  border: "3px solid rgba(26,26,26,0.15)",
                  borderRadius: 1,
                }} />
              </div>
            </TypeSwatch>
            <TypeSwatch label="Canvas" selected={productType === "canvas"} onClick={() => setProductType("canvas")}>
              <div style={{
                width: 36, height: 42, borderRadius: 2,
                background: "linear-gradient(145deg, #f5f0e8 0%, #ede5d8 100%)",
                border: "1px solid rgba(26,26,26,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "1px 1px 0 rgba(26,26,26,0.06), -1px 0 0 rgba(26,26,26,0.04)",
              }}>
                <div style={{
                  width: 22, height: 28,
                  background: "rgba(26,26,26,0.04)",
                  borderRadius: 0,
                }} />
              </div>
            </TypeSwatch>
          </div>
        </fieldset>

        {/* SIZE */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <Label text="Size" value={selectedSize} />
          <div className="relative">
            <button type="button" onClick={() => setSizeOpen(!sizeOpen)} className="w-full flex items-center justify-between" style={{ height: INPUT_H, padding: "0 16px", border: `1px solid ${BORDER}`, borderRadius: R, background: "#fff", fontSize: FS, cursor: "pointer", color: TEXT }}>
              <span>{selectedSize}</span>
              <ChevronDown size={16} style={{ opacity: 0.5, transform: sizeOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {sizeOpen && (
              <div className="absolute left-0 right-0 z-10" style={{ top: "calc(100% + 4px)", border: `1px solid ${BORDER_LIGHT}`, borderRadius: R, background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                {SIZES.map(size => (
                  <button key={size} type="button" onClick={() => { setSelectedSize(size); setSizeOpen(false); }} className="w-full text-left flex items-center justify-between" style={{ padding: "12px 16px", fontSize: FS, cursor: "pointer", background: selectedSize === size ? "rgba(26,26,26,0.04)" : "transparent", border: 0, color: TEXT, fontWeight: selectedSize === size ? 500 : 400 }}>
                    <span>{size}</span>
                    {selectedSize === size && <Check size={14} style={{ opacity: 0.5 }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </fieldset>

        {/* FRAME — only for Print type */}
        {!isCanvas && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <Label text="Frame" value={FRAMES.find(f => f.id === selectedFrame)?.label || ""} />
            <div className="flex flex-wrap" style={{ gap: 10 }}>
              {FRAMES.map(frame => <FrameSwatch key={frame.id} frame={frame} selected={selectedFrame === frame.id} onClick={() => setSelectedFrame(frame.id)} />)}
            </div>
          </fieldset>
        )}

        {/* MOUNT — only for Print type */}
        {!isCanvas && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <Label text="Mount" value={mountSelected ? "Yes" : "No"} />
            <div className="flex flex-wrap" style={{ gap: 10 }}>
              <MountSwatch selected={mountSelected} onClick={() => setMountSelected(true)} />
              <NoMountSwatch selected={!mountSelected} onClick={() => setMountSelected(false)} />
            </div>
          </fieldset>
        )}

        {/* UPGRADES — accordion with premium upgrade cards */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <Label
            text="Upgrades"
            value={upgradeCount > 0
              ? [glazeSelected && "Museum Glaze", upgradeSelected && (isFramed ? "Box Frame" : "Photo Rag")].filter(Boolean).join(", ")
              : "None"
            }
          />
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: R, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setUpgradesOpen(!upgradesOpen)}
              className="w-full flex items-center justify-between"
              style={{
                height: INPUT_H, padding: "0 16px",
                background: "#fff", border: 0, cursor: "pointer", fontFamily: "inherit",
                color: upgradeCount > 0 ? TEXT : SUB, fontSize: FS, fontWeight: 400,
              }}
            >
              <div className="flex items-center" style={{ gap: 8 }}>
                <span>
                  {upgradeCount > 0
                    ? `${upgradeCount} upgrade${upgradeCount > 1 ? "s" : ""} selected`
                    : "Add premium upgrades"
                  }
                </span>
                {upgradeCount > 0 && !upgradesOpen && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, lineHeight: "18px",
                    background: TEXT, color: "#fff",
                    borderRadius: 9, padding: "0 7px",
                  }}>
                    {upgradeCount}
                  </span>
                )}
              </div>
              <ChevronDown size={16} style={{ opacity: 0.5, transform: upgradesOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>

            {upgradesOpen && (
              <div style={{
                padding: `${PANEL_PAD}px`,
                display: "flex", flexDirection: "column", gap: 8,
                borderTop: "1px solid rgba(26,26,26,0.06)",
              }}>

                <PremiumUpgradeCard
                  title="Museum Quality Glaze"
                  price="+ £45.00"
                  headline="Gallery-grade protection for your artwork. Anti-reflective, UV-filtering glass preserves colours for 100+ years."
                  details="Used by the National Gallery and Tate Modern"
                  checked={glazeSelected}
                  onClick={() => setGlazeSelected(!glazeSelected)}
                  icon={<Shield size={12} />}
                  thumbnail={
                    <div style={{
                      width: 48, height: 48, borderRadius: 6, overflow: "hidden", flexShrink: 0,
                      background: "linear-gradient(145deg, rgba(200,220,240,0.3) 0%, rgba(180,200,230,0.15) 40%, rgba(255,255,255,0.5) 60%, rgba(200,215,235,0.2) 100%)",
                      border: "1px solid rgba(26,26,26,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      position: "relative",
                    }}>
                      <div style={{
                        width: 22, height: 28, borderRadius: 1,
                        background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,245,250,0.8) 100%)",
                        border: "1px solid rgba(26,26,26,0.06)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      }} />
                      <div style={{
                        position: "absolute", inset: 0, borderRadius: 6,
                        background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)",
                      }} />
                    </div>
                  }
                />

                {/* Frame/Paper upgrade — only for Print type */}
                {!isCanvas && (
                  <PremiumUpgradeCard
                    title={isFramed ? "Black Box Frame" : "Hahnemuhle Photo Rag"}
                    price={isFramed ? "+ £40.00" : "+ £15.00"}
                    headline={isFramed
                      ? "Hand-finished solid Ash frame with deep 32mm profile. Each piece individually stained and lacquered."
                      : "German-engineered 308gsm 100% cotton rag. The gold standard for fine art reproduction."
                    }
                    details={isFramed
                      ? "Handcrafted in our London workshop"
                      : "Trusted by galleries worldwide since 1584"
                    }
                    checked={upgradeSelected}
                    onClick={() => setUpgradeSelected(!upgradeSelected)}
                    icon={<Gem size={12} />}
                    thumbnail={
                      <div style={{
                        width: 48, height: 48, borderRadius: 6, overflow: "hidden", flexShrink: 0,
                        border: "1px solid rgba(26,26,26,0.08)",
                        background: isFramed
                          ? "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 50%, #333 100%)"
                          : "linear-gradient(145deg, #faf8f5 0%, #f5f0ea 50%, #ede5d8 100%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <div style={{
                          width: isFramed ? 18 : 22, height: isFramed ? 22 : 28,
                          border: isFramed ? "3px solid #444" : "1px solid rgba(26,26,26,0.08)",
                          borderRadius: 1,
                          background: isFramed ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)",
                        }} />
                      </div>
                    }
                  />
                )}
              </div>
            )}
          </div>
        </fieldset>

        {/* PRICE + CTA */}
        <div style={{ borderTop: `1px solid rgba(26,26,26,0.08)`, paddingTop: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: SUB }}>{summaryParts.join(" + ")}</span>
            <span style={{ fontSize: 18, fontWeight: 600 }}>£{totalPrice.toFixed(2)}</span>
          </div>
          <button type="button" style={{ width: "100%", height: 54, background: TEXT, color: "#fff", border: 0, borderRadius: R, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}>
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
