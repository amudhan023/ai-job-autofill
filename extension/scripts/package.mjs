#!/usr/bin/env node
// Zips the built extension/dist into a versioned archive for Chrome Web Store
// upload. Run after `npm run build` (the `package` npm script chains both).
//
// package.json is the single source of truth for the version; this script
// fails fast if src/manifest.json has drifted out of sync with it, rather
// than silently packaging a mismatched version.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { assertVersionSync } from "./versionSync.mjs";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(root, "src/manifest.json"), "utf8"));

try {
  assertVersionSync(pkg.version, manifest.version);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const distDir = resolve(root, "dist");
if (!existsSync(distDir)) {
  console.error("dist/ not found — run `npm run build` before packaging.");
  process.exit(1);
}

const releaseDir = resolve(root, "release");
mkdirSync(releaseDir, { recursive: true });

const zipName = `ai-job-autofill-extension-v${pkg.version}.zip`;
const zipPath = resolve(releaseDir, zipName);
rmSync(zipPath, { force: true });

// Zip dist/'s contents at the archive root (Chrome Web Store expects
// manifest.json at the top level, not nested under dist/).
execFileSync("zip", ["-r", "-X", zipPath, "."], { cwd: distDir, stdio: "inherit" });

console.log(`Packaged ${zipName} -> release/${zipName}`);
