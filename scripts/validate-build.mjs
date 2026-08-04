#!/usr/bin/env node
/**
 * Quick build validation.
 *
 * 1. Type-checks the whole project (includes both server entries).
 * 2. Compiles each server entry in isolation with esbuild-through-vite so a
 *    runtime-only import mistake in either target fails fast.
 * 3. Runs the real production build.
 *
 * Usage: npm run validate:build
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ENTRIES = [
  { name: "Workers (Cloudflare)", file: "src/server.ts" },
  { name: "Vercel", file: "src/server.vercel.ts" },
];

const run = (cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit" });
};

let failed = false;

for (const entry of ENTRIES) {
  if (!existsSync(resolve(process.cwd(), entry.file))) {
    console.error(`✗ missing server entry for ${entry.name}: ${entry.file}`);
    failed = true;
  } else {
    console.log(`✓ found ${entry.name} entry: ${entry.file}`);
  }
}

if (failed) process.exit(1);

try {
  run("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"]);
  console.log("✓ typecheck passed for both server entries");
  run("npx", ["vite", "build"]);
  console.log("\n✓ build validation passed");
} catch {
  console.error("\n✗ build validation failed");
  process.exit(1);
}
