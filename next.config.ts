import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'sharp'],
  outputFileTracingIncludes: {
    '/api/mark-batch/init': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**/*',
      './node_modules/pdfjs-dist/**/*',
    ],
  },
};

export default nextConfig;
