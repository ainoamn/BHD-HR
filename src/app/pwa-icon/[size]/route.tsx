import { ImageResponse } from "next/og";

const SIZES = [96, 192, 512];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

/** App icon of the installable portal: the BHD mark on the brand ink, with room for maskable cropping. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = SIZES.includes(Number(raw)) ? Number(raw) : 192;
  const mark = Math.round(size * 0.62);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#092d24" }}>
        <svg width={mark} height={Math.round((mark * 171) / 548)} viewBox="0 0 548 171">
          <g fill="#2ec4b6">
            <path d="M0 0h100c31 0 48 17 48 43 0 18-9 31-25 39 20 6 31 22 31 42 0 28-21 47-53 47H30v-28h70c16 0 26-8 26-20 0-13-11-22-29-22H0V74h97c15 0 24-8 24-21 0-15-10-25-25-25H28L0 0Z" />
            <path d="M385 0h74c52 0 89 35 89 85 0 51-37 86-89 86h-74l28-28h46c36 0 61-23 61-58 0-34-25-57-61-57h-46L385 0Z" />
          </g>
          <path fill="#ffffff" d="M190 109l30-27h90V0h30v171h-30v-62h-90v62h-30v-62Z" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
