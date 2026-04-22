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
    '/api/mark-batch/execute': [
      './src/assets/fonts/**/*',
    ],
    '/api/mark-batch/assemble-pdf': [
      './src/assets/fonts/**/*',
    ],
  },
};

export default nextConfig;
