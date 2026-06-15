import ashLogo from "@/assets/ash_logo.png";
const CRIMSON = "hsl(358 48% 45%)";
const FONT = '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

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
          height: "96px",
          background: CRIMSON,
          opacity: 0.2,
        }} />

        {/* Right: App name */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {/* paddingBottom on the mask leaves room for descenders (the "g"
              in Scheduling) so the reveal doesn't clip the letters */}
          <div style={{ overflow: "hidden", paddingBottom: "0.14em" }}>
            <span className="ldr-line1" style={{
              display: "block",
              fontFamily: FONT,
              fontSize: "2.1rem",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              color: "hsl(var(--foreground))",
            }}>
              Course
            </span>
          </div>
          <div style={{ overflow: "hidden", paddingBottom: "0.14em" }}>
            <span className="ldr-line2" style={{
              display: "block",
              fontFamily: FONT,
              fontSize: "2.1rem",
              fontWeight: 300,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              color: "hsl(var(--muted-foreground))",
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
