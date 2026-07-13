/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone é usado no Docker (EasyPanel); no Windows local os symlinks
  // do tracing falham sem modo desenvolvedor — desative com NEXT_STANDALONE=0
  output: process.env.NEXT_STANDALONE === "0" ? undefined : "standalone",
  transpilePackages: ["@iah/shared"],
  webpack: (config) => {
    // @iah/shared usa imports ESM com extensão .js apontando para fontes .ts
    config.resolve.extensionAlias = { ".js": [".ts", ".js"] };
    return config;
  },
};

export default nextConfig;
