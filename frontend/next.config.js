const devAssetVersion = Date.now().toString(36);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  webpack(config, { dev, isServer }) {
    if (dev && !isServer) {
      for (const key of ["filename", "chunkFilename"]) {
        const original = config.output[key];
        config.output[key] = typeof original === "function"
          ? (...args) => original(...args).replace(/\.js$/, `.${devAssetVersion}.js`)
          : original.replace(/\.js$/, `.${devAssetVersion}.js`);
      }
    }
    return config;
  },
  async redirects() {
    // Everyone signs in on one page; the session decides which panels open.
    return [
      { source: "/freelancer/login", destination: "/login", permanent: false },
      { source: "/admin/login", destination: "/login", permanent: false },
      { source: "/panel", destination: "/account", permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: "/account", destination: "/panel" },
      { source: "/account/:id", destination: "/panel/:id" },
    ];
  },
};

module.exports = nextConfig;
