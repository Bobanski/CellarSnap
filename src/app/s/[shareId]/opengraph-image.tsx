import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { resolvePublicPostShare } from "@/lib/shares";

const SCREEN_BG = "#220E14";
const SURFACE_PRIMARY = "#2E1420";
const SURFACE_RAISED = "#3A1020";
const TEXT_PRIMARY = "#F5EDD6";
const TEXT_SECONDARY = "#A08878";
const ACCENT_PRIMARY = "#7B1D3A";
const ACCENT_SECONDARY = "#C4607A";
const ACCENT_GOLD = "#C9A84C";
const BORDER = "rgba(196,96,122,0.10)";
const BORDER_STRONG = "rgba(196,96,122,0.22)";
const ACCENT_SOFT = "rgba(123,29,58,0.18)";
const PURPLE_GLOW = "rgba(107,77,138,0.24)";
const WINE_GLOW = "rgba(123,29,58,0.24)";

const fontDirectory = path.join(process.cwd(), "src/app/s/[shareId]/fonts");

const ogFontsPromise = Promise.all([
  readFile(path.join(fontDirectory, "CormorantGaramond_300Light.ttf")),
  readFile(path.join(fontDirectory, "DMSans_400Regular.ttf")),
  readFile(path.join(fontDirectory, "DMSans_500Medium.ttf")),
]).then(([serifLight, sansRegular, sansMedium]) => [
  {
    name: "Cluster Serif",
    data: serifLight,
    style: "normal" as const,
    weight: 300 as const,
  },
  {
    name: "Cluster Sans",
    data: sansRegular,
    style: "normal" as const,
    weight: 400 as const,
  },
  {
    name: "Cluster Sans",
    data: sansMedium,
    style: "normal" as const,
    weight: 500 as const,
  },
]);

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
  const [share, fonts] = await Promise.all([
    resolvePublicPostShare(shareId),
    ogFontsPromise,
  ]);

  if (!share) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            position: "relative",
            background: `linear-gradient(135deg, ${SCREEN_BG} 0%, ${SURFACE_PRIMARY} 58%, ${SCREEN_BG} 100%)`,
            color: TEXT_PRIMARY,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-120px",
              left: "-40px",
              width: "420px",
              height: "420px",
              borderRadius: "999px",
              background: PURPLE_GLOW,
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "-110px",
              bottom: "-160px",
              width: "420px",
              height: "420px",
              borderRadius: "999px",
              background: WINE_GLOW,
              display: "flex",
            }}
          />
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                borderRadius: "34px",
                border: `1px solid ${BORDER_STRONG}`,
                background: "rgba(21,16,32,0.94)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  padding: "10px 18px",
                  borderRadius: "999px",
                  border: `1px solid ${BORDER_STRONG}`,
                  background: ACCENT_SOFT,
                  color: ACCENT_SECONDARY,
                  fontFamily: "Cluster Sans",
                  fontSize: 20,
                  fontWeight: 500,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                Cluster
              </div>
              <div
                style={{
                  marginTop: "28px",
                  fontFamily: "Cluster Serif",
                  fontSize: 64,
                  lineHeight: 1,
                  display: "flex",
                }}
              >
                Link expired
              </div>
              <div
                style={{
                  marginTop: "18px",
                  color: TEXT_SECONDARY,
                  fontFamily: "Cluster Sans",
                  fontSize: 26,
                  display: "flex",
                }}
              >
                This shared post is no longer available.
              </div>
            </div>
          </div>
        </div>
      ),
      {
        ...size,
        fonts,
      }
    );
  }

  const wineName = share.wineName?.trim() || "Untitled wine";
  const vintage = share.vintage?.trim();
  const title = vintage ? `${wineName} (${vintage})` : wineName;
  // Decision 1 (overhaul-plan): the OG card leads with a warm band, never
  // the raw 1-100 rating. Match-% (when a fresh score exists) reinforces
  // the palate-matching wedge instead of a Vivino-style number.
  const ratingText = share.ratingBandLabel ?? "Cluster pick";
  const matchText =
    typeof share.matchScore === "number" ? `${share.matchScore}% match to their palate` : null;
  const noteText = share.notePreview ?? "Shared from Cluster";
  const previewImageUrl =
    share.previewImageOgUrl ??
    share.previewImageUrl ??
    share.labelImageOgUrl ??
    share.labelImageUrl;
  const authorText = `Posted by ${share.authorName}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: `linear-gradient(135deg, ${SCREEN_BG} 0%, ${SURFACE_PRIMARY} 52%, ${SCREEN_BG} 100%)`,
          color: TEXT_PRIMARY,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-140px",
            left: "-60px",
            width: "430px",
            height: "430px",
            borderRadius: "999px",
            background: PURPLE_GLOW,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-120px",
            bottom: "-180px",
            width: "460px",
            height: "460px",
            borderRadius: "999px",
            background: WINE_GLOW,
            display: "flex",
          }}
        />

        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            padding: "34px",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              borderRadius: "34px",
              overflow: "hidden",
              border: `1px solid ${BORDER_STRONG}`,
              background:
                "linear-gradient(180deg, rgba(30,24,48,0.96) 0%, rgba(21,16,32,0.98) 100%)",
            }}
          >
            <div
              style={{
                width: "39%",
                height: "100%",
                display: "flex",
                padding: "28px",
                background:
                  "linear-gradient(180deg, rgba(196,96,122,0.08) 0%, rgba(12,8,16,0) 100%)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  borderRadius: "28px",
                  overflow: "hidden",
                  border: `1px solid ${BORDER}`,
                  background: SURFACE_RAISED,
                  position: "relative",
                }}
              >
                {previewImageUrl ? (
                  <>
                    {/* next/og requires a plain img tag for remote image rendering */}
                    <img
                      src={previewImageUrl}
                      alt="Post preview"
                      width={420}
                      height={570}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: "0",
                        display: "flex",
                        background:
                          "linear-gradient(180deg, rgba(12,8,16,0.08) 0%, rgba(12,8,16,0.34) 100%)",
                      }}
                    />
                  </>
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: TEXT_SECONDARY,
                      fontFamily: "Cluster Sans",
                      fontSize: 26,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    No Photo
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                width: "61%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "38px 42px 34px 8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      padding: "9px 16px",
                      borderRadius: "999px",
                      border: `1px solid ${BORDER_STRONG}`,
                      background: ACCENT_SOFT,
                      color: ACCENT_SECONDARY,
                      fontFamily: "Cluster Sans",
                      fontSize: 18,
                      fontWeight: 500,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                    }}
                  >
                    Cluster
                  </div>
                  <div
                    style={{
                      display: "flex",
                      color: ACCENT_GOLD,
                      fontFamily: "Cluster Sans",
                      fontSize: 18,
                      fontWeight: 500,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    Shared Post
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    marginTop: "22px",
                    color: TEXT_SECONDARY,
                    fontFamily: "Cluster Sans",
                    fontSize: 24,
                    lineHeight: 1.25,
                  }}
                >
                  {authorText}
                </div>

                <div
                  style={{
                    display: "flex",
                    marginTop: "14px",
                    fontFamily: "Cluster Serif",
                    fontSize: 62,
                    lineHeight: 0.98,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {title}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginTop: "22px",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      padding: "11px 18px",
                      borderRadius: "999px",
                      border: `1px solid ${BORDER_STRONG}`,
                      background: "rgba(196,96,122,0.12)",
                      color: TEXT_PRIMARY,
                      fontFamily: "Cluster Sans",
                      fontSize: 24,
                      fontWeight: 500,
                    }}
                  >
                    {ratingText}
                  </div>
                  {matchText ? (
                    <div
                      style={{
                        display: "flex",
                        padding: "11px 18px",
                        borderRadius: "999px",
                        border: `1px solid rgba(201,168,76,0.4)`,
                        background: "rgba(201,168,76,0.12)",
                        color: ACCENT_GOLD,
                        fontFamily: "Cluster Sans",
                        fontSize: 22,
                        fontWeight: 500,
                      }}
                    >
                      {matchText}
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    color: TEXT_SECONDARY,
                    fontFamily: "Cluster Sans",
                    fontSize: 18,
                    fontWeight: 500,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  Tasting Note
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: "14px",
                    color: TEXT_PRIMARY,
                    fontFamily: "Cluster Sans",
                    fontSize: 32,
                    lineHeight: 1.28,
                    maxHeight: "162px",
                    overflow: "hidden",
                  }}
                >
                  {noteText}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginTop: "22px",
                    color: TEXT_SECONDARY,
                    fontFamily: "Cluster Sans",
                    fontSize: 20,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: "48px",
                      height: "1px",
                      background: ACCENT_PRIMARY,
                    }}
                  />
                  Open in Cluster
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
