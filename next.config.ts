import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  transpilePackages: ["react-simple-maps", "d3-geo", "d3-array", "d3-color", "d3-format", "d3-interpolate", "d3-scale", "d3-shape", "internmap", "delaunator", "robust-predicates"],
};

export default nextConfig;
