import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'sharp'],
  async rewrites() {
    return [
      // The paywall page must live OUTSIDE the /app layout — that layout's
      // gate redirects pass-less stranger accounts to /app/pass, so a route
      // under src/app/app would redirect to itself forever. src/app/pass is
      // the real page; this rewrite serves it at the /app/pass URL. These are
      // afterFiles rewrites: a filesystem route would win, so never create
      // src/app/app/pass.
      { source: '/app/pass', destination: '/pass' },
    ];
  },
  outputFileTracingIncludes: {
    '/api/mark-batch/init': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**/*',
      './node_modules/pdfjs-dist/**/*',
    ],
    '/api/mark-batch/execute': [
      './src/assets/fonts/**/*',
    ],
    '/api/mark-batch/assemble-pdf': [
      './src/assets/fonts/**/*',
    ],
  },
};

export default nextConfig;
