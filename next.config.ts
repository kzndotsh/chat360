import type { NextConfig } from 'next';

import CopyPlugin from 'copy-webpack-plugin';

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
        port: '',
        pathname: '/*',
      },
    ],
  },
  experimental: {
    typedRoutes: true,
  },
  logging: {
    fetches: {
      fullUrl: true,
      hmrRefreshes: true,
    },
  },
  reactStrictMode: false,
  webpack: (config) => {
    config.resolve.extensions.push('.ts', '.tsx');
    config.resolve.fallback = { fs: false };

    // Enable WebAssembly
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Add WASM MIME type
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    // Copy WASM files to public directory
    config.plugins.push(
      new CopyPlugin({
        patterns: [
          {
            from: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
            to: '../public/[name][ext]',
          },
          {
            from: 'node_modules/@ricky0123/vad-web/dist/*.onnx',
            to: '../public/[name][ext]',
          },
          {
            from: 'node_modules/agora-extension-ai-denoiser/external/*.wasm',
            to: '../public/external/agora-denoiser/[name][ext]',
          },
        ],
      })
    );

    return config;
  },
};

export default nextConfig;
