import { ImageResponse } from "next/og";
import { resolvePublicPostShare } from "@/lib/shares";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";
export const runtime = "nodejs";
export const revalidate = 300;

type OpenGraphImageProps = {
  params: Promise<{ shareId: string }>;
};

export default async function OpenGraphImage({ params }: OpenGraphImageProps) {
  const { shareId } = await params;
  const share = await resolvePublicPostShare(shareId);

  if (!share) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            background:
              "linear-gradient(135deg, #120f0d 0%, #211814 45%, #2a1f18 100%)",
            color: "#f4f4f5",
            fontSize: 48,
            padding: "56px",
          }}
        >
          <div style={{ fontSize: 24, letterSpacing: "0.22em", color: "#fcd34d" }}>
            CELLARSNAP
          </div>
          <div style={{ marginTop: "20px", fontWeight: 700 }}>Link expired</div>
        </div>
      ),
      {
        ...size,
      }
    );
  }

  const wineName = share.wineName?.trim() || "Untitled wine";
  const vintage = share.vintage?.trim();
  const title = vintage ? `${wineName} (${vintage})` : wineName;
  const ratingText =
    typeof share.rating === "number" ? `Rating ${share.rating}/100` : "No rating";
  const noteText = share.notePreview ?? "Shared from CellarSnap";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "radial-gradient(circle at top left, #2e1d13 0%, #1a120f 48%, #110d0b 100%)",
          color: "#f4f4f5",
          padding: "48px",
          fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            borderRadius: "36px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.28)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "34%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {share.labelImageUrl ? (
              <img
                src={share.labelImageUrl}
                alt="Wine label"
                width={320}
                height={320}
                style={{
                  objectFit: "cover",
                  borderRadius: "20px",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              />
            ) : (
              <div
                style={{
                  width: "320px",
                  height: "320px",
                  borderRadius: "20px",
                  border: "1px solid rgba(255,255,255,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#d4d4d8",
                  fontSize: 28,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                No Label
              </div>
            )}
          </div>

          <div
            style={{
              width: "66%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "48px 52px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  color: "#fcd34d",
                  letterSpacing: "0.2em",
                  fontSize: 22,
                  marginBottom: "20px",
                }}
              >
                CELLARSNAP
              </div>
              <div
                style={{
                  fontSize: 54,
                  lineHeight: 1.08,
                  fontWeight: 700,
                  marginBottom: "20px",
                  display: "flex",
                }}
              >
                {title}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 34,
                  color: "#fde68a",
                }}
              >
                {ratingText}
              </div>
            </div>

            <div
              style={{
                color: "#e4e4e7",
                fontSize: 37,
                lineHeight: 1.22,
                display: "flex",
                maxHeight: "190px",
                overflow: "hidden",
              }}
            >
              {noteText}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
