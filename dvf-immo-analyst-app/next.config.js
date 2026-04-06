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
  // Force the browser to always re-validate the service worker file.
  // Without this the browser can cache sw.js for up to 24 h which prevents
  // the PWA from picking up fixes or new app versions promptly.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
