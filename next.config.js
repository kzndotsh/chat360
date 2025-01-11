/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      bufferutil: false,
      'utf-8-validate': false
    };
    return config;
  },
  swcMinify: false, // Disable swc minification
  reactStrictMode: true,
  transpilePackages: ['agora-rtc-sdk-ng'] // Add transpilation for Agora SDK
}

module.exports = nextConfig