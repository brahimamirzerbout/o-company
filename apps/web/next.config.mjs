/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The marketing site is fully static at build time, so we can deploy to
  // any edge (Vercel, Cloudflare Pages, Netlify, S3+CloudFront) without
  // a server runtime.
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
  },
};
export default nextConfig;
