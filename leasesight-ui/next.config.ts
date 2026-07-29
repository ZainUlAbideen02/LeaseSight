import type { NextConfig } from "next";

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || '';

if (process.env.VERCEL === '1' && !clerkPublishableKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY on Vercel. ' +
      'Add it under Project → Settings → Environment Variables (Production + Preview), then redeploy. ' +
      '.env.local is not uploaded to Vercel.',
  );
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkPublishableKey,
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.VERCEL === '1' ? 'https://api.leasesights.tech' : 'http://localhost:8080'),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Empty turbopack config silences Next.js 16 custom webpack migration error
  turbopack: {},
  // Cross-Origin Isolation headers required for WASM WebWorker & SharedArrayBuffer performance
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },
  // Webpack config fallback for WASM module bundling
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
    };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  // @ts-ignore
  allowedDevOrigins: ['192.168.1.11', 'localhost:3000', 'localhost:3001'],
};

export default nextConfig;
