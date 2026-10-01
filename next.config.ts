import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cliente de base de datos con binarios nativos: se carga desde node_modules, sin empaquetar.
  serverExternalPackages: ["@libsql/client", "libsql"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
