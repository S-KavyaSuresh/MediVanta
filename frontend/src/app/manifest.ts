import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MediVanta",
    short_name: "MediVanta",
    description: "Smarter Hospitals. Seamless Care.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f8fb",
    theme_color: "#0b3f73",
    icons: [
      {
        src: "/medivanta-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
