import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app directory. Without this, Next infers the
  // root from lockfiles and can pick a parent directory (e.g. when running from
  // a git worktree), which misresolves paths. See:
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
