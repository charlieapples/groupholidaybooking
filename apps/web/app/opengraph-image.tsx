import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Group Holiday Booking — plan your trip together";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo area */}
        <div style={{ fontSize: 80, marginBottom: 24 }}>✈️</div>

        {/* App name */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "white",
            marginBottom: 16,
            letterSpacing: "-1px",
          }}
        >
          Group Holiday Booking
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.85)",
            marginBottom: 48,
          }}
        >
          Plan your group holiday together
        </div>

        {/* Feature pills */}
        <div style={{ display: "flex", gap: 16 }}>
          {[
            "✅ Find free dates",
            "✈️ Compare flights",
            "🗳️ Vote on destinations",
          ].map((f) => (
            <div
              key={f}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 40,
                padding: "10px 24px",
                color: "white",
                fontSize: 20,
              }}
            >
              {f}
            </div>
          ))}
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            color: "rgba(255,255,255,0.6)",
            fontSize: 18,
          }}
        >
          groupholidaybooking.com
        </div>
      </div>
    ),
    { ...size }
  );
}
