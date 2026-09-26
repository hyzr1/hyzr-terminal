import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // hide the dev-tools "N" badge that overlaps the perps terminal corner
  devIndicators: false,
};

export default nextConfig;
