/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdfjs-dist tries to require 'canvas' which doesn't exist in the browser
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
