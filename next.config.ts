import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.EASYTHON_DEMO === "1" ? ".next-demo" : ".next",
  reactCompiler: true,
  // Lets phones reach the dev server through an HTTPS tunnel for the QR demo.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app", "*.loca.lt"],
};

export default config;
