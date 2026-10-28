/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async redirects() {
    // Everyone signs in on one page; the session decides which panels open.
    return [
      { source: "/freelancer/login", destination: "/login", permanent: false },
      { source: "/admin/login", destination: "/login", permanent: false },
    ];
  },
};

module.exports = nextConfig;
