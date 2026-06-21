#!/bin/bash
# =============================================================================
# o.company · iOS TestFlight build
# =============================================================================
# Builds the iOS app, archives it, exports an .ipa, and (optionally)
# uploads to TestFlight.
#
# Usage:
#   ./scripts/ios-testflight.sh                      # build only
#   ./scripts/ios-testflight.sh --upload            # build + upload
#   ./scripts/ios-testflight.sh --export-only       # build + export .ipa, don't upload
#
# Prerequisites:
#   - macOS with Xcode 15+
#   - xcodebuild, xcrun in PATH
#   - Apple Developer account (for code signing)
#   -xcconfig file at apps/ios/Signing.xcconfig with:
#     DEVELOPMENT_TEAM = XXXXXXXXXX
#     PROVISIONING_PROFILE_SPECIFIER = o-company-ios
#
# The script does NOT store or transmit the signing certificate. The
# certificate is in your local Keychain. The .p12 is your secret, not
# this script's.

set -euo pipefail

UPLOAD=false
EXPORT_ONLY=false
for arg in "$@"; do
  case $arg in
    --upload) UPLOAD=true ;;
    --export-only) EXPORT_ONLY=true ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."

APP_DIR="apps/ios"
PROJECT="Noira.xcodeproj"
SCHEME="Noira"
CONFIGURATION="Release"
ARCHIVE_PATH="build/Noira.xcarchive"
EXPORT_PATH="build/Export"
IPA_PATH="$EXPORT_PATH/Noira.ipa"

echo ""
echo "o.company · iOS TestFlight build"
echo "================================"
echo ""
echo "Target: $SCHEME · $CONFIGURATION"
echo "Archive: $ARCHIVE_PATH"
echo "Export: $EXPORT_PATH"
echo ""

# Step 1: regenerate the Xcode project (xcodegen)
echo "1. Regenerating Xcode project from project.yml..."
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "   xcodegen not installed. Install with: brew install xcodegen"
  exit 1
fi
(cd "$APP_DIR" && xcodegen generate)

# Step 2: build the archive
echo ""
echo "2. Building archive..."
xcodebuild \
  -project "$APP_DIR/$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  clean archive

echo "   ✓ Archive built: $ARCHIVE_PATH"

# Step 3: export the .ipa
echo ""
echo "3. Exporting .ipa..."

# Generate the exportOptions.plist from the Signing.xcconfig.
# (We could template this, but for v1 we just use a static one.)
EXPORT_OPTIONS="$APP_DIR/ExportOptions.plist"
if [ ! -f "$EXPORT_OPTIONS" ]; then
  cat > "$EXPORT_OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>TEAM_ID_HERE</string>
    <key>uploadSymbols</key>
    <true/>
    <key>destination</key>
    <string>upload</string>
</dict>
</plist>
EOF
  echo "   Created $EXPORT_OPTIONS — edit teamID before running with --upload"
fi

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

if [ ! -f "$IPA_PATH" ]; then
  echo "   ✗ .ipa not found at $IPA_PATH"
  exit 1
fi
echo "   ✓ .ipa exported: $IPA_PATH"

# Step 4: upload to TestFlight (if requested)
if [ "$UPLOAD" = true ]; then
  echo ""
  echo "4. Uploading to TestFlight..."
  if ! command -v xcrun >/dev/null 2>&1; then
    echo "   xcrun not installed"
    exit 1
  fi
  # Use the high-level "altool" or the newer "xcrun notarytool" depending
  # on the macOS version. altool is deprecated in favor of xcrun
  # notarytool for app store uploads, but for TestFlight, altool still
  # works as of macOS 14.
  xcrun altool --upload-app --type ios --file "$IPA_PATH" --apiKey "$APP_STORE_CONNECT_API_KEY" --apiIssuer "$APP_STORE_CONNECT_API_ISSUER"
  echo "   ✓ Uploaded. Check App Store Connect for processing status."
fi

# Step 5: summary
echo ""
echo "================================"
echo "Build complete."
echo "================================"
echo "Archive: $ARCHIVE_PATH"
echo ".ipa:    $IPA_PATH"
if [ "$UPLOAD" = true ]; then
  echo "Status:  Uploaded to TestFlight"
else
  echo "Status:  Built but not uploaded (use --upload to push to TestFlight)"
fi
echo ""
echo "Next steps:"
echo "  1. Open App Store Connect → TestFlight → Builds"
echo "  2. Wait for the build to finish processing (~5 min)"
echo "  3. Add testers (internal group is fastest)"
echo "  4. Submit for TestFlight review (usually < 24h for internal)"
echo "  5. Install on your device via the TestFlight app"
echo ""
