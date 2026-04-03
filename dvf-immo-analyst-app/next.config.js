/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["@prisma/client", "prisma"] },
  // Include data files used by server-side API routes (IRIS CSV, centroids cache, public assets)
  outputFileTracingIncludes: {
    "/api/**": ["./data/**/*", "./public/**/*"],
  },
  webpack: (config) => {
    config.externals.push({ "utf-8-validate": "commonjs utf-8-validate", bufferutil: "commonjs bufferutil" });
    return config;
  },
};
module.exports = nextConfig;
