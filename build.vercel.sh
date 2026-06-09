#!/bin/bash
# Vercel Build Script - TanStack Start with Vercel Preset

set -e

echo "🚀 Building TanStack Start for Vercel..."
echo "Node version: $(node --version)"

# Install dependencies
echo "📦 Installing dependencies with Bun..."
bun install

# Build the application
echo "🔨 Building application..."
bun run build

# Check if build succeeded
if [ ! -d ".output" ]; then
  echo "❌ Build failed: .output directory not found"
  exit 1
fi

if [ ! -d ".output/public" ]; then
  echo "❌ Build failed: .output/public directory not found"
  exit 1
fi

if [ ! -f ".output/server/index.mjs" ]; then
  echo "⚠️  Warning: .output/server/index.mjs not found"
fi

echo "✅ Build completed successfully!"
echo ""
echo "📁 Output structure:"
echo "   - .output/public/   (static assets)"
echo "   - .output/server/   (server runtime)"
echo ""
echo "🎉 Ready for Vercel deployment!"
