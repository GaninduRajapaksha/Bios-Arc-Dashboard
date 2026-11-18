import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@neondatabase/serverless"],
  env: {
    NEXT_PUBLIC_APP_NAME: "BIOS-ARC",
  },
};

export default nextConfig;
