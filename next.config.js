const createNextIntlPlugin = require('next-intl/plugin')('./i18n.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  experimental: {
    workerThreads: false,
    cpus: 1
  }
}

module.exports = createNextIntlPlugin(nextConfig)
