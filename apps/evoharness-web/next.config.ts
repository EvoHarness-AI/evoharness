import type { NextConfig } from "next";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { isVerboseLogging } from "./bin/evoharness-web-options.js";

const configDir = dirname(fileURLToPath(import.meta.url));
// Workspace layout: the lockfile and the hoisted node_modules live at the
// repository root, so Turbopack's resolution root (and the file tracer's) must
// reach it — pinning both to the app directory hides the hoisted `next` package
// and every hoisted dependency.
const repoRoot = join(configDir, "..", "..");

const isDesktopBuild = process.env.EVOHARNESS_WEB_DESKTOP_BUILD === "1";

// mdast-util-gfm-autolink-literal (remark-gfm) ships a RegExp lookbehind that
// Safari parses only from 16.4, which blanked `/` on iOS 16.2 (#753). The loader
// swaps it for an equivalent built at runtime; both bundlers must run it.
const gfmAutolinkEmailLoader = join(configDir, "lib/gfm-autolink-email-loader.cjs");

const nextConfig: NextConfig = {
  logging: {
    // Use Next's source-level switch rather than filtering arbitrary stdout.
    // Query strings can carry credentials, even when diagnostics are enabled.
    incomingRequests: isVerboseLogging() ? { ignore: [/\?/] } : false,
    browserToTerminal: "warn",
    serverFunctions: false,
  },
  // Desktop packaging gets an isolated standalone build. Keeping it outside
  // `.next` prevents a release build from disrupting `npm run dev`.
  // outputFileTracingRoot roots standalone output at the repository root,
  // matching Turbopack's workspace root. Runtime home paths must still use
  // userHome(): NFT's outside-root check can miss Windows paths on another
  // drive and enumerate the user's profile.
  ...(isDesktopBuild
    ? { output: "standalone" as const, distDir: ".next-desktop" }
    : {}),
  outputFileTracingRoot: repoRoot,
  experimental: {
    // proxy.ts matches /api/:path*, and Next buffers the request body whenever
    // a proxy is present, capped at 10 MB by default. The upload route accepts
    // up to 100 MB per request, so raise the buffer above that or large uploads
    // are truncated and fail with "Failed to parse body as FormData."
    proxyClientMaxBodySize: "128mb",
    optimizePackageImports: ["react-syntax-highlighter"],
  },
  // next/image is only used for the static logo, so the /_next/image optimizer
  // (and its sharp/libheif attack surface, see GHSA-2xp9-vwfh-vxw4) is not needed.
  images: { unoptimized: true },
  // `next dev` runs Turbopack and `npm run build` runs webpack. The root pins
  // Turbopack's workspace root to the repository, so the hoisted packages at
  // the root node_modules resolve.
  turbopack: {
    root: repoRoot,
    rules: {
      "**/mdast-util-gfm-autolink-literal/lib/index.js": { loaders: [gfmAutolinkEmailLoader] },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /[\\/]mdast-util-gfm-autolink-literal[\\/]lib[\\/]index\.js$/,
      loader: gfmAutolinkEmailLoader,
    });
    return config;
  },
  // Node modules keep the syntax they ship unless listed here, and mermaid's
  // lazy diagram chunks are full of class `static {}` blocks (#753).
  transpilePackages: ["mermaid", "@mermaid-js/parser"],
  serverExternalPackages: [
    "node-pty",
    "undici",
    "web-push",
    // The codemode sandbox's WASM loader imports virtual WASI host modules
    // ("env", "wasi_snapshot_preview1") that only resolve at runtime.
    "quickjs-wasi",
    "@evoharness/coding-agent",
    "@evoharness/codemode",
    "@evoharness/agent-core",
    "@evoharness/ai",
    "@evoharness/tui",
  ],
  // Next 16 blocks cross-origin access to dev resources by default. Allow the
  // loopback and the RFC1918 LAN ranges so the dev server stays reachable
  // from other machines on the same LAN.
  allowedDevOrigins: [
    "127.0.0.1",
    "10.*.*.*",
    // 172.16.0.0/12
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
    "192.168.*.*",
  ],
  async headers() {
    return [
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // The bundled React preview runtime. The app page fetches it and
        // inlines it into preview documents; revalidate so an app update is
        // picked up at once.
        source: "/preview-runtime/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
