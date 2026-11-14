import type { NextConfig } from "next";

const config: NextConfig = {
  reactCompiler: true,
  // A self-contained server bundle: CI builds it once and the server only unpacks and runs it.
  output: "standalone",
  // Lets phones reach the dev server through an HTTPS tunnel when scanning the QR code.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app", "*.loca.lt"],
};

export default config;
