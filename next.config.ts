import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "@libsql/client/http", "@libsql/hrana-client"],
};

export default nextConfig;
