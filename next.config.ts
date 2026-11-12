import type { NextConfig } from "next";

const config: NextConfig = {
  reactCompiler: true,
  // Lets phones reach the dev server through an HTTPS tunnel when scanning the QR code.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app", "*.loca.lt"],
};

export default config;
