import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is required for the Lambda container deployment
  // (see infrastructure/Dockerfile — it copies .next/standalone).
  output: "standalone",
};

export default nextConfig;
