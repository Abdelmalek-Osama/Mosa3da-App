import type { MetadataRoute } from "next";

/**
 * Web app manifest: lets Chrome (Android/desktop) install the clinic system as
 * a standalone app with the clinic's branded icon. Served at /manifest.webmanifest
 * and linked automatically by Next.js.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "عيادة د. رودينا مدحت — Dr. Rodina Medhat Clinic",
    short_name: "عيادة د. رودينا",
    description: "نظام عيادة د. رودينا: الحجز وقائمة الانتظار والزائرات.",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1b2b4b",
    categories: ["medical", "health", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
