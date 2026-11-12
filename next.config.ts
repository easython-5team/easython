import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.EASYTHON_DEMO === "1" ? ".next-demo" : ".next",
  reactCompiler: true,
};

export default config;
