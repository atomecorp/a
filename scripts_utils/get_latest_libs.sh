#!/bin/bash

# Script to get the latest versions of libraries and download them locally
# Creates version tracking files for maintenance

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Base directory (from repo root)
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JS_DIR="$BASE_DIR/src/js"

echo -e "${BLUE}🔄 Starting library update process...${NC}"

# Function to get latest version from npm
get_latest_version() {
    local package_name="$1"
    curl -s "https://registry.npmjs.org/$package_name" | jq -r '.["dist-tags"].latest'
}

# Function to download and save library with version info
download_lib_version() {
    local url="$1" 
    local filename="$2"
    local package_name="$3"
    local version="$4"
    local filepath="$JS_DIR/$filename"
    
    echo -e "${YELLOW}� Downloading $package_name v$version...${NC}"
    
    # Download the file
    if curl -s -o "$filepath" "$url"; then
        local file_size=$(ls -lh "$filepath" | awk '{print $5}')
        echo -e "${GREEN}✅ Downloaded $filename ($file_size)${NC}"
        
        # Create version tracking file
        cat > "$filepath.version" << EOF
# Version info for $filename
package=$package_name
version=$version
download_date=$(date)
url=$url
EOF
        echo -e "${GREEN}� Created version file: $filename.version${NC}"
    else
        echo -e "${RED}❌ Failed to download $filename${NC}"
        return 1
    fi
}

# Function to download Wavesurfer plugins
download_wavesurfer_plugins() {
    local version="$1"
    local plugins_dir="$JS_DIR/wavesurfer-v7/plugins"
    
    echo -e "${YELLOW}📁 Creating Wavesurfer plugins directory...${NC}"
    mkdir -p "$plugins_dir"
    
    # List of essential Wavesurfer plugins
    local plugins=(
        "envelope.esm.min.js"
        "hover.esm.min.js" 
        "minimap.esm.min.js"
        "record.esm.min.js"
        "regions.esm.min.js"
        "spectrogram.esm.min.js"
        "spectrogram-windowed.esm.min.js"
        "timeline.esm.min.js"
        "zoom.esm.min.js"
    )
    
    for plugin in "${plugins[@]}"; do
        local plugin_url="https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/$version/plugins/$plugin"
        local plugin_path="$plugins_dir/$plugin"
        
        echo -e "${YELLOW}  📥 Downloading plugin: $plugin${NC}"
        if curl -s -o "$plugin_path" "$plugin_url"; then
            local file_size=$(ls -lh "$plugin_path" | awk '{print $5}')
            echo -e "${GREEN}  ✅ Downloaded $plugin ($file_size)${NC}"
        else
            echo -e "${RED}  ❌ Failed to download $plugin${NC}"
        fi
    done
}

# Create js directory if it doesn't exist
mkdir -p "$JS_DIR"

echo -e "${BLUE}🔍 Checking for latest versions...${NC}"

# GSAP
echo -e "
${BLUE}=== GSAP ===${NC}"
GSAP_VERSION=$(get_latest_version "gsap")
echo "Latest GSAP version: $GSAP_VERSION"
download_lib_version "https://cdnjs.cloudflare.com/ajax/libs/gsap/$GSAP_VERSION/gsap.min.js" "gsap.min.js" "gsap" "$GSAP_VERSION"

# Tone.js  
echo -e "
${BLUE}=== Tone.js ===${NC}"
TONE_VERSION=$(get_latest_version "tone")
echo "Latest Tone.js version: $TONE_VERSION"
download_lib_version "https://unpkg.com/tone@$TONE_VERSION/build/Tone.js" "tone.min.js" "tone" "$TONE_VERSION"

# Leaflet
echo -e "
${BLUE}=== Leaflet ===${NC}"
LEAFLET_VERSION=$(get_latest_version "leaflet")
echo "Latest Leaflet version: $LEAFLET_VERSION"
download_lib_version "https://cdnjs.cloudflare.com/ajax/libs/leaflet/$LEAFLET_VERSION/leaflet.min.js" "leaflet.min.js" "leaflet" "$LEAFLET_VERSION"
download_lib_version "https://cdnjs.cloudflare.com/ajax/libs/leaflet/$LEAFLET_VERSION/leaflet.min.css" "leaflet.min.css" "leaflet" "$LEAFLET_VERSION"

# Wavesurfer
echo -e "
${BLUE}=== Wavesurfer.js ===${NC}"
WAVESURFER_VERSION=$(get_latest_version "wavesurfer.js")
echo "Latest Wavesurfer version: $WAVESURFER_VERSION"
download_lib_version "https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/$WAVESURFER_VERSION/wavesurfer.min.js" "wavesurfer.min.js" "wavesurfer.js" "$WAVESURFER_VERSION"

# Download Wavesurfer plugins
echo -e "${YELLOW}� Downloading Wavesurfer plugins...${NC}"
download_wavesurfer_plugins "$WAVESURFER_VERSION"

# Create Wavesurfer core file
echo -e "${YELLOW}📝 Creating Wavesurfer core module...${NC}"
mkdir -p "$JS_DIR/wavesurfer-v7/core"
download_lib_version "https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/$WAVESURFER_VERSION/wavesurfer.esm.min.js" "wavesurfer-v7/core/wavesurfer.esm.min.js" "wavesurfer.js" "$WAVESURFER_VERSION"

# Three.js
echo -e "\n${BLUE}=== Three.js ===${NC}"
THREE_VERSION=$(get_latest_version "three")
echo "Latest Three.js version: $THREE_VERSION"
download_lib_version "https://cdnjs.cloudflare.com/ajax/libs/three.js/$THREE_VERSION/three.module.min.js" "three.min.js" "three" "$THREE_VERSION"

echo -e "
${GREEN}🎉 Library update completed successfully!${NC}"
echo -e "${BLUE}📊 Summary:${NC}"
echo "  - GSAP: v$GSAP_VERSION"
echo "  - Tone.js: v$TONE_VERSION"
echo "  - Leaflet: v$LEAFLET_VERSION (JS + CSS)"
echo "  - Wavesurfer.js: v$WAVESURFER_VERSION (Core + 9 plugins)"
echo "  - Three.js: v$THREE_VERSION"
echo -e "
${YELLOW}💡 Version files created in: $JS_DIR${NC}"