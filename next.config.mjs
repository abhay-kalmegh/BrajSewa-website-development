/** @type {import('next').NextConfig} */

// Extra image hosts (comma-separated hostnames), e.g. your CDN: IMAGE_HOSTS=cdn.brajsewa.com
const extraImageHosts = (process.env.IMAGE_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const nextConfig = {
  // Type errors now fail the build (run `pnpm typecheck`). Never re-enable ignoreBuildErrors.
  output: 'standalone',
  images: {
    // Next's optimizer resizes and converts to AVIF/WebP per device. Remote hosts must be allow-listed.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      ...extraImageHosts.map((hostname) => ({ protocol: 'https', hostname })),
    ],
  },
}

export default nextConfig
