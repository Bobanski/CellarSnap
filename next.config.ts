import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The sommelier manual is read from disk at runtime by the palate
  // distillation service — make sure it ships with the serverless bundle.
  outputFileTracingIncludes: {
    "/api/palate/distill": ["./docs/sommelier-manual.md"],
    "/api/list-scan/recommendation-notes": ["./docs/sommelier-manual.md"],
  },
};

export default nextConfig;
