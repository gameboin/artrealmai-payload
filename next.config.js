import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['payload'],
  
  // ADDED: Increase upload limit for Payload Admin (Server Actions)
  experimental: {
    serverActions: {
      bodySizeLimit: '2gb', // Set to 2GB to allow large video files
    },
  },

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