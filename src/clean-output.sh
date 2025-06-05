#!/bin/bash

# Script de nettoyage des fichiers de sortie temporaires
# Usage: ./clean-output.sh

OUTPUT_DIR="output"

echo "🧹 Cleaning Squirrel output directory..."
echo "📁 Directory: $OUTPUT_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -d "$OUTPUT_DIR" ]; then
    echo "⚠️ Output directory does not exist: $OUTPUT_DIR"
    exit 0
fi

# Compter les fichiers avant nettoyage
FILE_COUNT=$(find "$OUTPUT_DIR" -type f | wc -l | tr -d ' ')

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "✅ Output directory is already clean"
    exit 0
fi

echo "📊 Found $FILE_COUNT files to clean"

# Demander confirmation
read -p "🗑️ Delete all files in $OUTPUT_DIR? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Supprimer tous les fichiers
    rm -f "$OUTPUT_DIR"/*
    
    # Vérifier le nettoyage
    REMAINING_COUNT=$(find "$OUTPUT_DIR" -type f | wc -l | tr -d ' ')
    
    if [ "$REMAINING_COUNT" -eq 0 ]; then
        echo "✅ Successfully cleaned $FILE_COUNT files"
    else
        echo "⚠️ $REMAINING_COUNT files remaining"
    fi
else
    echo "❌ Cleaning cancelled"
fi
