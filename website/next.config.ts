import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables Netlify plugin to deploy SSR routes as functions
  output: "standalone",
};

export default nextConfig;
