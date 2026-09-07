import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const applicationDirectory = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  outputFileTracingRoot: path.resolve(applicationDirectory, "../.."),
  serverExternalPackages: ["postgres"]
};

export default config;
