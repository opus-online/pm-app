import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Avatar uploads (src/app/actions/avatars.ts) go up to 2 MB; the multipart
      // envelope adds overhead on top of that, so leave headroom above the 1 MB default.
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // Harmless locally (local dev is http; browsers ignore HSTS over http),
            // and forces HTTPS in production once the site is reachable over TLS.
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        // The claude.ai connector consent page and login must never be framed by another site
        // (clickjacking an "Allow"). Same-origin framing isn't used anywhere either.
        source: "/oauth/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/login",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
