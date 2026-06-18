import type { NextConfig } from "next";

const isDesktopExport = process.env.NEXT_DESKTOP_EXPORT === "true";

const nextConfig: NextConfig = {
  output: isDesktopExport ? "export" : undefined,
};

export default nextConfig;
