// next.config.js – FINAL VERSION THAT WORKS ON RENDER (Next 15.4.7)
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['payload'],
  // This flag was REMOVED in Next.js 15.1+ → delete it!
  // experimental: { missingSuspenseWithCSRBailout: false },  ← DELETE THIS LINE

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@payload-config': path.resolve(__dirname, 'payload.config.ts'),
      '@': path.resolve(__dirname, 'src'),
    }
    return config
  },
}

export default nextConfig
