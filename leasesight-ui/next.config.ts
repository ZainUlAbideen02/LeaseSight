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
  // output: 'export' is for Vercel static builds — disabled for local dev
  env: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkPublishableKey,
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.VERCEL === '1' ? 'https://api.leasesights.tech' : 'http://localhost:8080'),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // @ts-ignore
  allowedDevOrigins: ['192.168.1.11', 'localhost:3000', 'localhost:3001'],
};

export default nextConfig;
