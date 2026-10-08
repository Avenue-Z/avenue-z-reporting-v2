import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF export route runs headless Chromium (app/api/export/pdf). Both packages must stay out of
  // the bundle, and Chromium's compressed binary must be traced into that one function.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/export/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
  experimental: {
    // Report pages are dynamic (they read auth()/cookies()/searchParams), so by
    // default (staleTimes.dynamic = 0) every navigation — even back to a section
    // you just viewed — re-renders the full RSC on the server. Keep visited
    // sections in the client Router Cache for 3 minutes so revisiting within
    // that window is an instant client-side render with no server round-trip.
    // Safe here: the underlying data is cached hourly, so a few-minutes-old
    // render on instant back-nav is fine.
    staleTimes: {
      dynamic: 180,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google profile photos
      },
    ],
  },
};

export default nextConfig;
