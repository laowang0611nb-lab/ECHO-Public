import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  output: "standalone",
  turbopack: {
    root: path.parse(process.cwd()).root,
  },
};

export default nextConfig;
