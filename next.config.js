/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  // Disable x-powered-by header
  poweredByHeader: false,
  // Enable source maps for debugging
  productionBrowserSourceMaps: false, // Set to true if you want source maps in production
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // Webpack config for better debugging
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.devtool = 'eval-source-map';
    }
    return config;
  },
}

module.exports = nextConfig


