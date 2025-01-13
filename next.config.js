/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*'
      }
    ]
  },
  experimental: {
    // optimizeCss: true,
    // optimizeImages: true,
    // optimizeFonts: true,
    // scrollRestoration: true,
    // esmExternals: true,
    // modern: true,
    // polyfillsOptimization: true,
    // reactRoot: true,
    // scriptLoader: true,
    // workerThreads: true,
    // workerBundles: true,
    // externalDir: true,
    // pageEnv: true,
    // isrMemoryCacheSize: 100,
    // isrPages: true,
    // isrFlushToDisk: 
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  logging: {
    fetches: {
      fullUrl: true,
      hmrRefreshes: true,
    },
  }
};


module.exports = nextConfig;