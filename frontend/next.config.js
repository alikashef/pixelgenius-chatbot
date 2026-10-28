/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
