#!/bin/bash

# Basic library updater with fixed stable versions
# Fallback script for reliable updates

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m' 
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JS_DIR="$BASE_DIR/src/js"

echo -e "${BLUE}🔄 Updating libraries with stable versions...${NC}"

# Function to download library
download_lib() {
    local url="$1"
    local filename="$2" 
    local filepath="$JS_DIR/$filename"
    
    echo -e "${YELLOW}📥 Downloading $filename...${NC}"
    
    if curl -s -o "$filepath" "$url"; then
        local file_size=$(ls -lh "$filepath" | awk '{print $5}')
        echo -e "${GREEN}✅ Downloaded $filename ($file_size)${NC}"
    else
        echo -e "${RED}❌ Failed to download $filename${NC}"
        return 1
    fi
}

# Function to download Wavesurfer plugins
download_wavesurfer_plugins() {
    local version="7.10.1"
    local plugins_dir="$JS_DIR/wavesurfer-v7/plugins"
    
    mkdir -p "$plugins_dir"
    
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
        curl -s -o "$plugin_path" "$plugin_url"
    done
}

mkdir -p "$JS_DIR"

# Download libraries with stable versions
echo -e "\n${BLUE}=== Downloading stable versions ===${NC}"

# GSAP v3.13.0
download_lib "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js" "gsap.min.js"

# Tone.js v15.1.22
download_lib "https://unpkg.com/tone@15.1.22/build/Tone.js" "tone.min.js"

# Leaflet v1.9.4
download_lib "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" "leaflet.min.js"
download_lib "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" "leaflet.min.css"

# Wavesurfer v7.10.1
download_lib "https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.10.1/wavesurfer.min.js" "wavesurfer.min.js"

# Download Wavesurfer plugins
echo -e "${YELLOW}🔌 Downloading Wavesurfer plugins...${NC}"
download_wavesurfer_plugins

# Wavesurfer core ESM
mkdir -p "$JS_DIR/wavesurfer-v7/core"
download_lib "https://cdnjs.cloudflare.com/ajax/libs/wavesurfer.js/7.10.1/wavesurfer.esm.min.js" "wavesurfer-v7/core/wavesurfer.esm.min.js"

# Three.js v0.179.1
download_lib "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.179.1/three.module.min.js" "three.min.js"

echo -e "\n${GREEN}🎉 All libraries updated successfully!${NC}"
echo -e "${BLUE}📊 Stable versions installed:${NC}"
echo "  - GSAP: v3.13.0"
echo "  - Tone.js: v15.1.22"
echo "  - Leaflet: v1.9.4 (JS + CSS)"
echo "  - Wavesurfer.js: v7.10.1 (Core + 9 plugins)" 
echo "  - Three.js: v0.179.1"
