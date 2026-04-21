import { useState } from "react";
import { ChevronDown, Check, Sparkles } from "lucide-react";

const SIZES = [
  "A4 - 8.27\" x 11.67\"",
  "A3 - 11.69\" x 16.54\"",
  "A2 - 16.54\" x 23.39\"",
];

const FRAMES = [
  { id: "unframed", label: "Unframed", image: null },
  { id: "black", label: "Black Frame", image: "black" },
  { id: "white", label: "White Frame", image: "white" },
  { id: "natural", label: "Natural Frame", image: "natural" },
];

export function Redesigned() {
  const [selectedSize, setSelectedSize] = useState(SIZES[0]);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState("black");
  const [mountSelected, setMountSelected] = useState(false);
  const [glazeSelected, setGlazeSelected] = useState(false);
  const [upgradeSelected, setUpgradeSelected] = useState(false);
  const [paperUpgradeSelected, setPaperUpgradeSelected] = useState(false);

  const isFramed = selectedFrame !== "unframed";

  return (
    <div
      className="min-h-screen p-6 sm:p-8"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#1a1a1a",
        background: "#ffffff",
      }}
    >
      <div className="max-w-[440px] mx-auto flex flex-col" style={{ gap: "28px" }}>
        {/* SIZE */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="flex items-baseline gap-2" style={{ marginBottom: 8 }}>
            <legend style={{ fontWeight: 600, fontSize: 14 }}>Size:</legend>
            <span style={{ fontWeight: 400, fontSize: 14 }}>{selectedSize}</span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSizeOpen(!sizeOpen)}
              className="w-full flex items-center justify-between"
              style={{
                height: 50,
                padding: "0 16px",
                border: "1px solid rgba(26,26,26,0.2)",
                borderRadius: 8,
                background: "#fff",
                fontSize: 14,
                cursor: "pointer",
                color: "#1a1a1a",
              }}
            >
              <span>{selectedSize}</span>
              <ChevronDown
                size={16}
                style={{
                  opacity: 0.5,
                  transform: sizeOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              />
            </button>
            {sizeOpen && (
              <div
                className="absolute left-0 right-0 z-10"
                style={{
                  top: "calc(100% + 4px)",
                  border: "1px solid rgba(26,26,26,0.15)",
                  borderRadius: 8,
                  background: "#fff",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                  overflow: "hidden",
                }}
              >
                {SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setSelectedSize(size);
                      setSizeOpen(false);
                    }}
                    className="w-full text-left flex items-center justify-between"
                    style={{
                      padding: "12px 16px",
                      fontSize: 14,
                      cursor: "pointer",
                      background:
                        selectedSize === size
                          ? "rgba(26,26,26,0.04)"
                          : "transparent",
                      border: 0,
                      color: "#1a1a1a",
                      fontWeight: selectedSize === size ? 500 : 400,
                    }}
                  >
                    <span>{size}</span>
                    {selectedSize === size && (
                      <Check size={14} style={{ opacity: 0.5 }} />
                    )}
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
            <span style={{ fontWeight: 400, fontSize: 14 }}>
              {FRAMES.find((f) => f.id === selectedFrame)?.label}
            </span>
          </div>
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            {FRAMES.map((frame) => (
              <button
                key={frame.id}
                type="button"
                onClick={() => setSelectedFrame(frame.id)}
                style={{
                  width: 66,
                  height: 50,
                  borderRadius: 8,
                  border: "none",
                  outline: "none",
                  padding: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  position: "relative",
                  background: "#fff",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 8,
                    border:
                      selectedFrame === frame.id
                        ? "1.5px solid #1a1a1a"
                        : "1px solid rgba(26,26,26,0.15)",
                    pointerEvents: "none",
                    zIndex: 2,
                    transition: "border-color 0.15s",
                  }}
                />
                {frame.image ? (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background:
                        frame.id === "black"
                          ? "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 50%, #333 100%)"
                          : frame.id === "white"
                            ? "linear-gradient(135deg, #f5f5f5 0%, #fff 50%, #eee 100%)"
                            : "linear-gradient(135deg, #d4b896 0%, #c4a87a 50%, #e0c9a8 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 24,
                        border:
                          frame.id === "black"
                            ? "3px solid #444"
                            : frame.id === "white"
                              ? "3px solid #ddd"
                              : "3px solid #b8956a",
                        borderRadius: 1,
                        background: "rgba(255,255,255,0.15)",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#fafafa",
                      fontSize: 10,
                      color: "rgba(26,26,26,0.5)",
                      fontStyle: "italic",
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      <svg
                        width="40"
                        height="36"
                        viewBox="0 0 40 36"
                        fill="none"
                        style={{ opacity: 0.3 }}
                      >
                        <rect
                          x="8"
                          y="4"
                          width="24"
                          height="28"
                          rx="1"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <line
                          x1="6"
                          y1="34"
                          x2="34"
                          y2="2"
                          stroke="currentColor"
                          strokeWidth="1"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </fieldset>

        {/* ENHANCEMENTS — compact toggles */}
        <div className="flex flex-col" style={{ gap: 20 }}>
          {/* Mount toggle */}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <div
              className="flex items-baseline gap-2"
              style={{ marginBottom: 8 }}
            >
              <legend style={{ fontWeight: 600, fontSize: 14 }}>Mount:</legend>
              <span style={{ fontWeight: 400, fontSize: 14 }}>
                {mountSelected ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex" style={{ gap: 0 }}>
              <button
                type="button"
                onClick={() => setMountSelected(true)}
                style={{
                  flex: 1,
                  height: 50,
                  border: "1px solid",
                  borderColor: mountSelected
                    ? "#1a1a1a"
                    : "rgba(26,26,26,0.2)",
                  borderRadius: "8px 0 0 8px",
                  background: "#fff",
                  color: mountSelected ? "#1a1a1a" : "rgba(26,26,26,0.5)",
                  fontWeight: 400,
                  fontSize: 14,
                  cursor: "pointer",
                  position: "relative",
                  zIndex: mountSelected ? 2 : 1,
                  transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setMountSelected(false)}
                style={{
                  flex: 1,
                  height: 50,
                  border: "1px solid",
                  borderColor: !mountSelected
                    ? "#1a1a1a"
                    : "rgba(26,26,26,0.2)",
                  borderRadius: "0 8px 8px 0",
                  background: "#fff",
                  color: !mountSelected ? "#1a1a1a" : "rgba(26,26,26,0.5)",
                  fontWeight: 400,
                  fontSize: 14,
                  cursor: "pointer",
                  marginLeft: -1,
                  position: "relative",
                  zIndex: !mountSelected ? 2 : 1,
                  transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
              >
                No
              </button>
            </div>
          </fieldset>

          {/* Museum Quality Glaze toggle */}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <div
              className="flex items-center gap-2"
              style={{ marginBottom: 8 }}
            >
              <legend style={{ fontWeight: 600, fontSize: 14 }}>
                Museum Quality Glaze:
              </legend>
              <span style={{ fontWeight: 400, fontSize: 14 }}>
                {glazeSelected ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex" style={{ gap: 0 }}>
              <button
                type="button"
                onClick={() => setGlazeSelected(true)}
                style={{
                  flex: 1,
                  height: 50,
                  border: "1px solid",
                  borderColor: glazeSelected
                    ? "#1a1a1a"
                    : "rgba(26,26,26,0.2)",
                  borderRadius: "8px 0 0 8px",
                  background: "#fff",
                  color: glazeSelected ? "#1a1a1a" : "rgba(26,26,26,0.5)",
                  fontWeight: 400,
                  fontSize: 14,
                  cursor: "pointer",
                  position: "relative",
                  zIndex: glazeSelected ? 2 : 1,
                  transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setGlazeSelected(false)}
                style={{
                  flex: 1,
                  height: 50,
                  border: "1px solid",
                  borderColor: !glazeSelected
                    ? "#1a1a1a"
                    : "rgba(26,26,26,0.2)",
                  borderRadius: "0 8px 8px 0",
                  background: "#fff",
                  color: !glazeSelected ? "#1a1a1a" : "rgba(26,26,26,0.5)",
                  fontWeight: 400,
                  fontSize: 14,
                  cursor: "pointer",
                  marginLeft: -1,
                  position: "relative",
                  zIndex: !glazeSelected ? 2 : 1,
                  transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
              >
                No
              </button>
            </div>
            {glazeSelected && (
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(26,26,26,0.5)",
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                UV-protective, anti-reflective museum glass. Preserves colours
                for 100+ years.
              </p>
            )}
          </fieldset>

          {/* Frame / Paper Upgrade */}
          {isFramed ? (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <div
                className="flex items-baseline gap-2"
                style={{ marginBottom: 8 }}
              >
                <legend style={{ fontWeight: 600, fontSize: 14 }}>
                  Frame Upgrade:
                </legend>
                <span style={{ fontWeight: 400, fontSize: 14 }}>
                  {upgradeSelected ? "Black Box Frame" : "None selected"}
                </span>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  cursor: "pointer",
                  padding: 0,
                }}
                onClick={() => setUpgradeSelected(!upgradeSelected)}
              >
                <div
                  style={{
                    width: 66,
                    height: 50,
                    borderRadius: 8,
                    overflow: "hidden",
                    flexShrink: 0,
                    border: upgradeSelected
                      ? "1.5px solid #1a1a1a"
                      : "1px solid rgba(26,26,26,0.15)",
                    boxSizing: "border-box",
                    background:
                      "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 60%, #333 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 22,
                      border: "4px solid #444",
                      borderRadius: 1,
                      background: "rgba(255,255,255,0.08)",
                    }}
                  />
                </div>
                <div
                  className="flex flex-col"
                  style={{ gap: 1, minWidth: 0 }}
                >
                  <div
                    className="flex items-baseline flex-wrap"
                    style={{ gap: 4 }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      Black Box Frame
                    </span>
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: 13,
                        color: "rgba(26,26,26,0.45)",
                      }}
                    >
                      (+ £40.00)
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "rgba(26,26,26,0.45)",
                      lineHeight: 1.3,
                    }}
                  >
                    Our most luxurious frame. Milled from solid Ash and
                    hand-stained.
                  </span>
                </div>
              </label>
            </fieldset>
          ) : (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <div
                className="flex items-baseline gap-2"
                style={{ marginBottom: 8 }}
              >
                <legend style={{ fontWeight: 600, fontSize: 14 }}>
                  Paper Upgrade:
                </legend>
                <span style={{ fontWeight: 400, fontSize: 14 }}>
                  {paperUpgradeSelected ? "Hahnemuhle Photo Rag" : "None selected"}
                </span>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  cursor: "pointer",
                  padding: 0,
                }}
                onClick={() => setPaperUpgradeSelected(!paperUpgradeSelected)}
              >
                <div
                  style={{
                    width: 66,
                    height: 50,
                    borderRadius: 8,
                    overflow: "hidden",
                    flexShrink: 0,
                    border: paperUpgradeSelected
                      ? "1.5px solid #1a1a1a"
                      : "1px solid rgba(26,26,26,0.15)",
                    boxSizing: "border-box",
                    background:
                      "linear-gradient(135deg, #faf8f5 0%, #f5f0ea 50%, #ede5d8 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 28,
                      borderRadius: 1,
                      background: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(26,26,26,0.08)",
                    }}
                  />
                </div>
                <div
                  className="flex flex-col"
                  style={{ gap: 1, minWidth: 0 }}
                >
                  <div
                    className="flex items-baseline flex-wrap"
                    style={{ gap: 4 }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      Hahnemuhle Photo Rag
                    </span>
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: 13,
                        color: "rgba(26,26,26,0.45)",
                      }}
                    >
                      (+ £15.00)
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "rgba(26,26,26,0.45)",
                      lineHeight: 1.3,
                    }}
                  >
                    Premium 308gsm cotton rag. Exceptional detail and colour
                    depth.
                  </span>
                </div>
              </label>
            </fieldset>
          )}
        </div>

        {/* Divider + price summary */}
        <div>
          <div
            style={{
              borderTop: "1px solid rgba(26,26,26,0.08)",
              paddingTop: 20,
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 16 }}
            >
              <span style={{ fontSize: 13, color: "rgba(26,26,26,0.5)" }}>
                {(() => {
                  const parts = [];
                  const frame = FRAMES.find((f) => f.id === selectedFrame);
                  parts.push(frame?.label || "");
                  if (mountSelected) parts.push("Mount");
                  if (glazeSelected) parts.push("Museum Glaze");
                  if (upgradeSelected && isFramed) parts.push("Box Frame");
                  if (paperUpgradeSelected && !isFramed) parts.push("Photo Rag");
                  return parts.join(" + ");
                })()}
              </span>
              <span style={{ fontSize: 18, fontWeight: 600 }}>
                {(() => {
                  let price = 25;
                  if (selectedFrame !== "unframed") price += 30;
                  if (mountSelected) price += 10;
                  if (glazeSelected) price += 45;
                  if (upgradeSelected && isFramed) price += 40;
                  if (paperUpgradeSelected && !isFramed) price += 15;
                  return `£${price.toFixed(2)}`;
                })()}
              </span>
            </div>
            <button
              type="button"
              style={{
                width: "100%",
                height: 54,
                background: "#1a1a1a",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.02em",
              }}
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
