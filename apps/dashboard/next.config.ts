import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  // The repo root has its own lockfile (tooling only); this app is its own project.
  turbopack: { root: path.join(__dirname) },
};

export default config;
