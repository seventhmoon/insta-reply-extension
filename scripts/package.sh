#!/bin/bash
# package.sh — Builds a clean ZIP package for Chrome Web Store submission

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

VERSION=$(node -p "require('./manifest.json').version")
OUTPUT="insta-reply-ai-v${VERSION}.zip"

echo "📦 Packaging InstaReply AI v${VERSION} for Chrome Web Store..."

# Remove previous zip if exists
rm -f "$OUTPUT"

# Create clean ZIP excluding dev, test, and git files
zip -r "$OUTPUT" . \
  -x ".git/*" \
  -x ".gitignore" \
  -x "node_modules/*" \
  -x ".env*" \
  -x "*.map" \
  -x "test/*" \
  -x "scripts/*" \
  -x "package.json" \
  -x "package-lock.json" \
  -x "CHROMEWEBSTORE.md" \
  -x "README.md" \
  -x "PRIVACY.md" \
  -x ".DS_Store" \
  -x "*/.DS_Store" \
  -x "Thumbs.db" \
  -x "_metadata/*" \
  -x "*.zip"

echo ""
echo "✅ Package created successfully: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "🚀 Ready to upload to the Chrome Web Store Developer Dashboard!"
