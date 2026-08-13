import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  sassOptions: {
    includePaths: ["./src/styles"],
  },
  images: {
    unoptimized: true,
  },
  // Backend-heavy project - avoid bundling browser-only deps into client
  serverExternalPackages: ["playwright"],
};

export default nextConfig;