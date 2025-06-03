#!/usr/bin/env bash

echo "🚀 Prism WASM Installation - Download Only..."

# Check if @ruby/prism is installed
if [ ! -d "node_modules/@ruby/prism" ]; then
    echo "❌ @ruby/prism not found"
    echo "💡 Installing automatically..."
    npm install @ruby/prism
fi

# Create destination folder
rm -rf src/squirrel/parser/
mkdir -p src/squirrel/parser/

echo "1️⃣ Copying essential files..."

#!/usr/bin/env bash

echo "🚀 Prism WASM Installation - Download Only..."

# Check if @ruby/prism is installed
if [ ! -d "node_modules/@ruby/prism" ]; then
    echo "❌ @ruby/prism not found"
    echo "💡 Installing automatically..."
    npm install @ruby/prism
fi

# Create destination folder
mkdir -p src/squirrel/parser/

echo "1️⃣ Exploring @ruby/prism structure..."
echo "📋 Package contents:"
find node_modules/@ruby/prism -name "*.wasm" -type f 2>/dev/null | head -10

echo ""
echo "📋 Searching for WASM files..."

# Search for WASM files in various locations
WASM_FOUND=false
WASM_LOCATIONS=(
    "node_modules/@ruby/prism/src/prism.wasm"
    "node_modules/@ruby/prism/prism.wasm"
    "node_modules/@ruby/prism/dist/prism.wasm"
    "node_modules/@ruby/prism/lib/prism.wasm"
    "node_modules/@ruby/prism/wasm/prism.wasm"
)

for location in "${WASM_LOCATIONS[@]}"; do
    if [ -f "$location" ]; then
        echo "✅ Found WASM at: $location"
        
        # Verify it's actually a WASM file
        if file "$location" 2>/dev/null | grep -q "WebAssembly"; then
            echo "✅ Verified as WebAssembly binary"
            cp "$location" src/squirrel/parser/prism.wasm
            WASM_FOUND=true
            echo "✅ prism.wasm copied and verified"
            break
        else
            echo "⚠️ File exists but is not WebAssembly: $(file "$location" 2>/dev/null)"
        fi
    fi
done

if [ "$WASM_FOUND" = false ]; then
    echo "❌ No valid WASM file found in @ruby/prism package"
    echo "📋 Package structure:"
    ls -la node_modules/@ruby/prism/ 2>/dev/null || echo "Package not accessible"
    echo ""
    echo "💡 Trying alternative download method..."
    
    # Try downloading from GitHub releases
    echo "📥 Downloading from GitHub releases..."
    curl -L -o src/squirrel/parser/prism.wasm \
        "https://github.com/ruby/prism/releases/latest/download/prism.wasm" || \
        echo "❌ GitHub download failed"
    
    # Verify downloaded file
    if [ -f "src/squirrel/parser/prism.wasm" ]; then
        if file src/squirrel/parser/prism.wasm 2>/dev/null | grep -q "WebAssembly"; then
            echo "✅ GitHub WASM download successful and verified"
            WASM_FOUND=true
        else
            echo "❌ Downloaded file is not valid WebAssembly"
            rm -f src/squirrel/parser/prism.wasm
        fi
    fi
fi

if [ "$WASM_FOUND" = false ]; then
    echo "❌ Could not obtain valid prism.wasm file"
    exit 1
fi

# Copy JavaScript files from node_modules if they exist
FILES_TO_COPY=(
    "src/nodes.js:nodes.js"
    "src/visitor.js:visitor.js" 
    "src/deserialize.js:deserialize.js"
)

for file_mapping in "${FILES_TO_COPY[@]}"; do
    source_file="${file_mapping%%:*}"
    dest_file="${file_mapping##*:}"
    
    if [ -f "node_modules/@ruby/prism/$source_file" ]; then
        cp "node_modules/@ruby/prism/$source_file" "src/squirrel/parser/$dest_file"
        echo "✅ $dest_file copied"
    else
        echo "⚠️  $source_file not found (optional)"
    fi
done

echo "2️⃣ Downloading additional WASI dependencies..."

# Download browser WASI shim
curl -s -o src/squirrel/parser/browser_wasi_shim.js \
    https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@0.3.0/dist/index.js || \
    echo "⚠️  Could not download browser_wasi_shim.js"

echo "✅ Installation completed!"
echo "📋 Files downloaded to: src/squirrel/parser/"
echo "🔧 Next: Create the required JavaScript files separately"