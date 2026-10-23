import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";

const serviceWorkerVersion = process.env.VERCEL_DEPLOYMENT_ID?.trim() || randomUUID();

const localNetworkOrigins = Object.values(networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CANDOR_SW_VERSION: serviceWorkerVersion
  },
  devIndicators: false,
  allowedDevOrigins: process.env.NODE_ENV === "development" ? localNetworkOrigins : [],
  outputFileTracingIncludes: {
    "/*": ["./stories/**/*.json", "./game-content/fact-opinion.json"]
  },
  async headers() {
    return process.env.NOINDEX === "0" ? [] : [{
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }]
    }];
  }
};

export default nextConfig;
