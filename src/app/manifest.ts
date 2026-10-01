import type { MetadataRoute } from "next";

/** Permite instalar Finora en la pantalla de inicio del celular (PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finora",
    short_name: "Finora",
    description: "Tus finanzas personales, claras.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    lang: "es-CO",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
