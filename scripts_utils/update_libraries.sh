#!/bin/bash

# Script pour télécharger les dernières versions de GSAP et Tone.js
# Usage: ./update_libs.sh

LIBS_DIR="../src/js"

# URLs des librairies
GSAP_URL="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"
TONE_URL="https://unpkg.com/tone@latest/build/Tone.js"

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 Mise à jour des librairies JavaScript...${NC}"

# Créer le dossier s'il n'existe pas
mkdir -p "$LIBS_DIR"

# Fonction pour télécharger une librairie
download_lib() {
    local filename="$1"
    local url="$2"
    
    echo -e "${YELLOW}📦 Traitement de $filename...${NC}"
    
    # Sauvegarder l'ancienne version
    if [ -f "$LIBS_DIR/$filename" ]; then
        echo -e "${YELLOW}💾 Sauvegarde de l'ancienne version...${NC}"
        cp "$LIBS_DIR/$filename" "$LIBS_DIR/$filename.backup"
    fi

    # Télécharger la nouvelle version
    echo -e "${YELLOW}⬇️  Téléchargement de $filename...${NC}"
    if curl -L -o "$LIBS_DIR/$filename" "$url"; then
        # Vérifier la taille du fichier
        SIZE=$(stat -f%z "$LIBS_DIR/$filename" 2>/dev/null || stat -c%s "$LIBS_DIR/$filename" 2>/dev/null)
        if [ "$SIZE" -gt 1000 ]; then
            echo -e "${GREEN}✅ $filename mis à jour avec succès!${NC}"
            echo -e "${GREEN}📊 Taille du fichier: $(($SIZE / 1024)) KB${NC}"
            
            # Supprimer la sauvegarde si tout va bien
            rm -f "$LIBS_DIR/$filename.backup"
        else
            echo -e "${RED}❌ Le fichier $filename semble corrompu${NC}"
            # Restaurer la sauvegarde
            if [ -f "$LIBS_DIR/$filename.backup" ]; then
                mv "$LIBS_DIR/$filename.backup" "$LIBS_DIR/$filename"
                echo -e "${YELLOW}🔄 Ancienne version de $filename restaurée${NC}"
            fi
            return 1
        fi
    else
        echo -e "${RED}❌ Erreur lors du téléchargement de $filename${NC}"
        # Restaurer la sauvegarde
        if [ -f "$LIBS_DIR/$filename.backup" ]; then
            mv "$LIBS_DIR/$filename.backup" "$LIBS_DIR/$filename"
            echo -e "${YELLOW}🔄 Ancienne version de $filename restaurée${NC}"
        fi
        return 1
    fi
    return 0
}

# Télécharger GSAP
success_count=0
total_count=2

if download_lib "gsap.min.js" "$GSAP_URL"; then
    ((success_count++))
fi
echo ""

# Télécharger Tone.js
if download_lib "tone.min.js" "$TONE_URL"; then
    ((success_count++))
fi
echo ""

# Résumé final
echo -e "${YELLOW}📋 Résumé de la mise à jour:${NC}"
echo -e "${GREEN}✅ $success_count/$total_count librairies mises à jour avec succès${NC}"

if [ $success_count -eq $total_count ]; then
    echo -e "${GREEN}🎉 Toutes les librairies sont maintenant à jour dans $LIBS_DIR/${NC}"
    echo -e "${GREEN}📁 Fichiers disponibles:${NC}"
    echo -e "   • gsap.min.js (GSAP Animation Library)"
    echo -e "   • tone.min.js (Tone.js Audio Library)"
    exit 0
else
    echo -e "${RED}⚠️  Certaines librairies n'ont pas pu être mises à jour${NC}"
    exit 1
fi
