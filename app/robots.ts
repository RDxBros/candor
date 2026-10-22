import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const noindex = process.env.NOINDEX !== "0";
  return {
    rules: noindex
      ? { userAgent: "*", disallow: "/" }
      : { userAgent: "*", allow: "/" }
  };
}
