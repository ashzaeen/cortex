import type { MetadataRoute } from "next";

// Home-screen app (design.md 9.1): standalone, background matches --bg so there is no white flash.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cortex",
    short_name: "Cortex",
    description: "Your memory, with proof.",
    start_url: "/app",
    display: "standalone",
    background_color: "#08130F",
    theme_color: "#08130F",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
