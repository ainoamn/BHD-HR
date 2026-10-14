import { portalEmployee } from "@/lib/portal";

/** Install manifest of one employee's portal: opens straight on their page, named after their company. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const employee = await portalEmployee(token);
  if (!employee) return new Response("Not found", { status: 404 });
  const base = `/portal/${token}`;
  const manifest = {
    name: `${employee.company.name} — بوابة الموظف`,
    short_name: "بوابتي",
    description: "Employee portal",
    start_url: base,
    scope: `${base}`,
    id: base,
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#ffffff",
    theme_color: "#092d24",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
