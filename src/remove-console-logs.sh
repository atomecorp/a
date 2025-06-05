#!/bin/zsh

echo "🧹 Suppression AGGRESSIVE des console.log de test..."

# Créer un dossier de sauvegarde
backup_dir="console_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"
echo "📋 Dossier de sauvegarde: $backup_dir"

total_removed=0
files_modified=0

# Fonction pour supprimer les console.log multi-lignes
remove_multiline_console_log() {
    local file="$1"
    local temp_file=$(mktemp)
    local inside_console_log=false
    local paren_count=0
    local removed_lines=0
    
    while IFS= read -r line || [ -n "$line" ]; do
        # Vérifier si on commence un console.log avec émojis OU mots-clés de test
        if [[ "$line" =~ console\.log.*[🔥🧪📁📄💾🚀✅❌🛑🗑️🧹⚡🎉✨] ]] || \
           [[ "$line" =~ console\.log.*[Tt]est ]] || \
           [[ "$line" =~ console\.log.*[Dd]ebug ]] || \
           [[ "$line" =~ console\.log.*[Aa]rchitecture ]] || \
           [[ "$line" =~ console\.log.*[Pp]erformance ]] || \
           [[ "$line" =~ console\.log.*[Ss]erver ]] || \
           [[ "$line" =~ console\.log.*[Ss]hutting ]] || \
           [[ "$line" =~ console\.log.*[Rr]unning ]] || \
           [[ "$line" =~ console\.log.*[Ss]tarting ]] || \
           [[ "$line" =~ console\.log.*[Ee]ndpoint ]] || \
           [[ "$line" =~ console\.log.*[Cc]losed ]] || \
           [[ "$line" =~ console\.log.*[Aa]vailable ]] || \
           [[ "$line" =~ console\.log.*[Ss]aved ]] || \
           [[ "$line" =~ console\.log.*[Dd]eleted ]] || \
           [[ "$line" =~ console\.log.*[Cc]leaned ]] || \
           [[ "$line" =~ ^[[:space:]]*\/\/.*console\.log ]]; then
            
            inside_console_log=true
            
            # Compter les parenthèses ouvertes et fermées dans cette ligne
            local open_parens=$(echo "$line" | tr -cd '(' | wc -c)
            local close_parens=$(echo "$line" | tr -cd ')' | wc -c)
            paren_count=$((open_parens - close_parens))
            
            ((removed_lines++))
            
            # Si les parenthèses sont équilibrées dans cette ligne, on termine ici
            if [ $paren_count -le 0 ]; then
                inside_console_log=false
            fi
            continue
        fi
        
        # Si on est à l'intérieur d'un console.log multi-ligne
        if [ "$inside_console_log" = true ]; then
            # Compter les parenthèses dans cette ligne
            local open_parens=$(echo "$line" | tr -cd '(' | wc -c)
            local close_parens=$(echo "$line" | tr -cd ')' | wc -c)
            paren_count=$((paren_count + open_parens - close_parens))
            
            ((removed_lines++))
            
            # Si on a fermé toutes les parenthèses, on sort du console.log
            if [ $paren_count -le 0 ]; then
                inside_console_log=false
            fi
            continue
        fi
        
        # Sinon, garder la ligne
        echo "$line" >> "$temp_file"
        
    done < "$file"
    
    # Remplacer le fichier original si des changements ont été faits
    if [ $removed_lines -gt 0 ]; then
        mv "$temp_file" "$file"
    else
        rm "$temp_file"
    fi
    
    echo $removed_lines
}

# Fonction pour traiter un fichier
process_file() {
    local file="$1"
    local basename_file=$(basename "$file")
    
    echo "🔍 Traitement: $file"
    
    # Créer une sauvegarde
    cp "$file" "$backup_dir/${basename_file}.backup"
    
    # Compter les lignes avant modification
    local lines_before=$(wc -l < "$file")
    
    # Supprimer les console.log commentés simples
    sed -i '' '/^[[:space:]]*\/\/.*console\.\(log\|debug\|info\|table\|warn\)/d' "$file"
    
    # Supprimer les console.log multi-lignes de test/debug
    local multiline_removed=$(remove_multiline_console_log "$file")
    
    # Supprimer TOUS les console.log avec émojis
    sed -i '' '/console\.log.*🔥/d' "$file"
    sed -i '' '/console\.log.*🧪/d' "$file"
    sed -i '' '/console\.log.*📁/d' "$file"
    sed -i '' '/console\.log.*📄/d' "$file"
    sed -i '' '/console\.log.*💾/d' "$file"
    sed -i '' '/console\.log.*🚀/d' "$file"
    sed -i '' '/console\.log.*✅/d' "$file"
    sed -i '' '/console\.log.*❌/d' "$file"
    sed -i '' '/console\.log.*🛑/d' "$file"
    sed -i '' '/console\.log.*🗑️/d' "$file"
    sed -i '' '/console\.log.*🧹/d' "$file"
    sed -i '' '/console\.log.*⚡/d' "$file"
    sed -i '' '/console\.log.*🎉/d' "$file"
    sed -i '' '/console\.log.*✨/d' "$file"
    
    # Supprimer TOUS les console.log avec mots-clés (y compris serveur)
    sed -i '' '/console\.log.*[Tt]est/d' "$file"
    sed -i '' '/console\.log.*[Dd]ebug/d' "$file"
    sed -i '' '/console\.log.*[Aa]rchitecture/d' "$file"
    sed -i '' '/console\.log.*[Pp]erformance/d' "$file"
    sed -i '' '/console\.log.*[Ss]erver/d' "$file"
    sed -i '' '/console\.log.*[Ss]hutting/d' "$file"
    sed -i '' '/console\.log.*[Rr]unning/d' "$file"
    sed -i '' '/console\.log.*[Ss]tarting/d' "$file"
    sed -i '' '/console\.log.*[Ee]ndpoint/d' "$file"
    sed -i '' '/console\.log.*[Cc]losed/d' "$file"
    sed -i '' '/console\.log.*[Aa]vailable/d' "$file"
    sed -i '' '/console\.log.*[Ss]aved/d' "$file"
    sed -i '' '/console\.log.*[Dd]eleted/d' "$file"
    sed -i '' '/console\.log.*[Cc]leaned/d' "$file"
    
    # Supprimer les console.log vides
    sed -i '' '/^[[:space:]]*console\.log();[[:space:]]*$/d' "$file"
    
    # Compter les lignes après modification
    local lines_after=$(wc -l < "$file")
    local removed=$((lines_before - lines_after))
    
    if [ $removed -gt 0 ]; then
        echo "✅ Supprimé $removed lignes dans $basename_file"
        ((total_removed += removed))
        ((files_modified++))
    else
        echo "ℹ️  Aucune modification dans $basename_file"
        # Supprimer la sauvegarde inutile
        rm "$backup_dir/${basename_file}.backup"
    fi
}

# Traiter tous les fichiers .js
for jsfile in $(find . -name "*.js" -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./console_backup_*/*"); do
    process_file "$jsfile"
done

echo ""
echo "🎉 Nettoyage terminé!"
echo "📊 Total lignes supprimées: $total_removed"
echo "📊 Fichiers modifiés: $files_modified"

if [ $files_modified -eq 0 ]; then
    rmdir "$backup_dir" 2>/dev/null
    echo "ℹ️  Aucune sauvegarde nécessaire"
else
    echo "📋 Sauvegardes disponibles dans: $backup_dir"
    echo "💡 Pour restaurer: cp $backup_dir/[fichier].backup [fichier_original]"
fi