/** @type {import('next').NextConfig} */
const nextConfig = {
  // Let verification builds run beside the active local dev server without
  // sharing or clearing its .next directory.
  ...(process.env.DENTALOS_BUILD_DIR ? { distDir: process.env.DENTALOS_BUILD_DIR } : {}),
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }]
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
