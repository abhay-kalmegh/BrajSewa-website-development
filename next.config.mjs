import { buildSecurityHeaders } from './security-headers.mjs'

/** @type {import('next').NextConfig} */

// Extra image hosts (comma-separated hostnames), e.g. your CDN: IMAGE_HOSTS=cdn.brajsewa.com
const extraImageHosts = (process.env.IMAGE_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const nextConfig = {
  // Type errors now fail the build (run `pnpm typecheck`). Never re-enable ignoreBuildErrors.
  output: 'standalone',
  poweredByHeader: false,            // do not advertise "X-Powered-By: Next.js"
  async headers() {
    return [{ source: '/:path*', headers: buildSecurityHeaders() }]
  },
  images: {
    // Next's optimizer resizes and converts to AVIF/WebP per device. Remote hosts must be allow-listed.
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,          // re-use optimised images for a day instead of re-processing them (CPU)
    remotePatterns: [
      // Only photo paths, so this server cannot be used as a free resizer for everything on the host.
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/photo-*' },
      ...extraImageHosts.map((hostname) => ({ protocol: 'https', hostname })),
    ],
  },
}

export default nextConfig
