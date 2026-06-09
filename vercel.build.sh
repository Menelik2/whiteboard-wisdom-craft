#!/bin/bash
# Vercel Build Script for TanStack Start with Vercel Preset

set -e

echo "🔨 Building TanStack Start application for Vercel..."

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Run build
echo "🏗️  Building application..."
bun run build

# Verify output directory
if [ -d ".output" ]; then
  echo "✅ Build successful! Output directory created."
else
  echo "❌ Build failed! Output directory not found."
  exit 1
fi

echo "🎉 Build completed successfully for Vercel!"
