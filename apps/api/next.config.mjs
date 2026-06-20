/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The API is stateless — it talks to Postgres and external services.
  // We can deploy it as a single-region Vercel function for the MVP and
  // multi-region later.
  experimental: {
    typedRoutes: true,
  },
};
export default nextConfig;
