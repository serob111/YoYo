import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Next.js only auto-loads .env files from this app's own directory, but this
// monorepo keeps one .env at the repo root — load it explicitly for local dev.
// Staging/production inject real environment variables directly.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@yoyo/contracts", "@yoyo/permissions"]
};

export default nextConfig;
