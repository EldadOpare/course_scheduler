import ashLogo from "@/assets/ash_logo.png";
const CRIMSON = "hsl(358 48% 45%)";

export default function AppLoader({ exiting }: { exiting?: boolean }) {
  return (
    <div
      className={exiting ? "ldr-exit" : ""}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "hsl(var(--background))",
      }}
    >
      {/* Horizontal lockup — centred on page */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "3rem",
        userSelect: "none",
      }}>

        {/* Left: Ashesi logo */}
        <div className="ldr-logo">
          <img
            src={ashLogo}
            alt="Ashesi University"
            style={{ height: "120px", width: "auto", display: "block" }}
          />
        </div>

        {/* Vertical rule */}
        <div className="ldr-rule" style={{
          width: "1px",
          height: "80px",
          background: CRIMSON,
          opacity: 0.2,
        }} />

        {/* Right: App name */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ overflow: "hidden" }}>
            <span className="ldr-line1" style={{
              display: "block",
              fontSize: "1.75rem",
              fontWeight: 500,
              letterSpacing: "0.02em",
              color: "hsl(var(--foreground))",
              lineHeight: 1,
            }}>
              Course
            </span>
          </div>
          <div style={{ overflow: "hidden" }}>
            <span className="ldr-line2" style={{
              display: "block",
              fontSize: "1.75rem",
              fontWeight: 300,
              letterSpacing: "0.02em",
              color: "hsl(var(--muted-foreground))",
              lineHeight: 1,
            }}>
              Scheduling System
            </span>
          </div>
        </div>

      </div>

      {/* Progress line — bottom edge */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: "2px",
        background: "hsl(var(--border) / 0.3)",
      }}>
        <div className="ldr-bar" style={{
          height: "100%",
          background: CRIMSON,
          width: 0,
        }} />
      </div>
    </div>
  );
}
