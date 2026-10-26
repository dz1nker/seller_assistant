import type { NextConfig } from 'next';
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

const nextConfig: NextConfig = {
  output: process.env.SALES_DOCKER_STANDALONE === 'true' ? 'standalone' : undefined,
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  transpilePackages: ['@sales/shared', '@sales/ui'],
  poweredByHeader: false,
  experimental: { cpus: 2 },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:4000'}/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default nextConfig;
