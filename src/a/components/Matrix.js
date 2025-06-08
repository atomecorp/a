/**
 * 🔲 Matrix Component - Squirrel Framework
 * 
 * Component for creating responsive grid matrices with interactive cells.
 * Each cell has a unique ID based on its position and supports various
 * interaction callbacks including clicks, double-clicks, long-clicks, and mouse events.
 * 
 * @version 1.0.0
 * @author Squirrel Framework Team
 */

class Matrix {
    static matrices = new Map(); // Registry of all matrices
    static resizeObserver = null; // Global resize observer

    constructor(config = {}) {
        // Default configuration
        this.config = {
            id: config.id || `matrix_${Date.now()}`,
            attach: config.attach || 'body',
            
            // Grid dimensions
            grid: {
                x: config.grid?.x || 3,
                y: config.grid?.y || 3
            },
            
            // Position
            position: {
                x: config.position?.x || 0,
                y: config.position?.y || 0
            },
            
            // Size
            size: {
                width: config.size?.width || '300px',
                height: config.size?.height || '300px'
            },
            
            // Enhanced spacing configuration
            spacing: {
                horizontal: config.spacing?.horizontal || 2,
                vertical: config.spacing?.vertical || 2,
                mode: config.spacing?.mode || 'gap', // 'gap', 'margin', 'padding', 'border'
                uniform: config.spacing?.uniform !== false, // Espacement uniforme par défaut
                outer: config.spacing?.outer || 0, // Espacement externe (padding du container)
                // Enhanced features
                animate: config.spacing?.animate !== false, // Smooth transitions when spacing changes
                adaptiveMin: config.spacing?.adaptiveMin || 0, // Minimum spacing that adapts to content
                responsive: config.spacing?.responsive || false, // Auto-adjust spacing based on viewport
                debugMode: config.spacing?.debugMode || false, // Visual debugging indicators
                // NEW: Advanced gradient spacing
                gradient: config.spacing?.gradient || false, // Enable gradient spacing (variable spacing across matrix)
                gradientDirection: config.spacing?.gradientDirection || 'horizontal', // 'horizontal', 'vertical', 'radial'
                gradientIntensity: config.spacing?.gradientIntensity || 0.5, // 0.1 to 1.0
                // NEW: Custom animation settings
                animationEasing: config.spacing?.animationEasing || 'ease', // CSS easing or custom cubic-bezier
                animationDuration: config.spacing?.animationDuration || 300, // milliseconds
                animationDelay: config.spacing?.animationDelay || 0, // milliseconds between cell animations
                // NEW: Accessibility and performance
                reduceMotion: config.spacing?.reduceMotion !== false, // Respect prefers-reduced-motion
                optimizeRendering: config.spacing?.optimizeRendering !== false, // Use will-change and transform optimization
                semanticLabels: config.spacing?.semanticLabels || false // Add ARIA labels for spacing changes
            },
            
            // Cell styling
            cellStyle: {
                backgroundColor: '#3498db',
                border: '2px solid #2980b9',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                color: 'white',
                fontWeight: 'bold',
                ...config.cellStyle
            },
            
            // Hover style
            cellHoverStyle: {
                backgroundColor: '#2980b9',
                transform: 'scale(1.05)',
                ...config.cellHoverStyle
            },
            
            // Selected style
            cellSelectedStyle: {
                backgroundColor: '#e74c3c',
                border: '3px solid #c0392b',
                ...config.cellSelectedStyle
            },
            
            // Long click duration (ms)
            longClickDuration: config.longClickDuration || 600,
            
            // Callbacks
            callbacks: {
                onClick: config.callbacks?.onClick || (() => {}),
                onDoubleClick: config.callbacks?.onDoubleClick || (() => {}),
                onLongClick: config.callbacks?.onLongClick || (() => {}),
                onMouseUp: config.callbacks?.onMouseUp || (() => {}),
                onMouseDown: config.callbacks?.onMouseDown || (() => {}),
                onHover: config.callbacks?.onHover || (() => {}),
                onResize: config.callbacks?.onResize || (() => {})
            }
        };

        this.id = this.config.id;
        this.cells = new Map(); // Store cell elements and data
        this.selectedCells = new Set(); // Track selected cells
        this.isPercentageSize = this._isPercentageSize();
        
        this._createMatrix();
        this._setupEventHandlers();
        this._setupResizeObserver();
        
        // Register matrix
        Matrix.matrices.set(this.id, this);
        
        console.log(`🔲 Matrix created: ${this.id} (${this.config.grid.x}x${this.config.grid.y})`);
    }

    _isPercentageSize() {
        return (
            (typeof this.config.size.width === 'string' && this.config.size.width.includes('%')) ||
            (typeof this.config.size.height === 'string' && this.config.size.height.includes('%'))
        );
    }

    _createMatrix() {
        // Get container
        const container = typeof this.config.attach === 'string' 
            ? document.querySelector(this.config.attach)
            : this.config.attach;

        if (!container) {
            throw new Error(`Container not found: ${this.config.attach}`);
        }

        // Create main matrix element
        this.element = document.createElement('div');
        this.element.className = 'squirrel-matrix';
        this.element.id = this.id;
        
        // Apply styling with improved spacing
        const matrixStyle = {
            position: 'absolute',
            left: `${this.config.position.x}px`,
            top: `${this.config.position.y}px`,
            width: this.config.size.width,
            height: this.config.size.height,
            display: 'grid',
            gridTemplateColumns: `repeat(${this.config.grid.x}, 1fr)`,
            gridTemplateRows: `repeat(${this.config.grid.y}, 1fr)`,
            boxSizing: 'border-box',
            userSelect: 'none'
        };

        // Apply spacing based on mode
        this._applySpacingMethod(matrixStyle);
        
        Object.assign(this.element.style, matrixStyle);

        // Create cells
        this._createCells();

        container.appendChild(this.element);
    }

    _applySpacingMethod(matrixStyle) {
        const spacing = this.config.spacing;
        
        // Apply responsive spacing if enabled
        const effectiveSpacing = this._calculateResponsiveSpacing(spacing);
        
        // NEW: Check for reduced motion preference
        const shouldAnimate = spacing.animate && spacing.reduceMotion && 
            !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        // Enhanced animation support with custom easing and duration
        if (shouldAnimate) {
            const easingFunction = this._getEasingFunction(spacing.animationEasing);
            matrixStyle.transition = `gap ${spacing.animationDuration}ms ${easingFunction}, padding ${spacing.animationDuration}ms ${easingFunction}`;
            
            // NEW: Performance optimization hint
            if (spacing.optimizeRendering) {
                matrixStyle.willChange = 'gap, padding';
            }
        }
        
        // Add debug mode visual indicators
        if (spacing.debugMode) {
            matrixStyle.outline = '2px dashed #ff6b6b';
            matrixStyle.outlineOffset = '2px';
        }
        
        // NEW: Apply gradient spacing if enabled
        if (spacing.gradient) {
            this._applyGradientSpacing(matrixStyle, effectiveSpacing);
        } else {
            this._applyUniformSpacing(matrixStyle, effectiveSpacing);
        }
        
        // NEW: Add semantic labeling for accessibility
        if (spacing.semanticLabels) {
            this.element.setAttribute('aria-label', 
                `Matrix with ${spacing.mode} spacing: ${effectiveSpacing.horizontal}px horizontal, ${effectiveSpacing.vertical}px vertical`);
        }
    }

    _getEasingFunction(easing) {
        const easingPresets = {
            'ease': 'ease',
            'ease-in': 'ease-in',
            'ease-out': 'ease-out',
            'ease-in-out': 'ease-in-out',
            'linear': 'linear',
            'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            'elastic': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            'smooth': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            'sharp': 'cubic-bezier(0.4, 0.0, 0.6, 1)',
            'gentle': 'cubic-bezier(0.25, 0.1, 0.25, 1)'
        };
        
        return easingPresets[easing] || easing; // Allow custom cubic-bezier values
    }

    _applyGradientSpacing(matrixStyle, effectiveSpacing) {
        const spacing = this.config.spacing;
        const { gradientDirection, gradientIntensity } = spacing;
        
        // Store gradient info for cell spacing calculation
        this.gradientInfo = {
            direction: gradientDirection,
            intensity: gradientIntensity,
            baseSpacing: effectiveSpacing
        };
        
        // For gradient spacing, we use margin mode to achieve variable spacing
        matrixStyle.gap = '0';
        matrixStyle.padding = `${spacing.outer}px`;
        this.spacingMode = 'gradient';
        this.effectiveSpacing = effectiveSpacing;
    }

    _applyUniformSpacing(matrixStyle, effectiveSpacing) {
        const spacing = this.config.spacing;
        
        switch (spacing.mode) {
            case 'gap':
                // Mode CSS Grid gap (par défaut)
                if (spacing.uniform) {
                    // Espacement uniforme forcé
                    const avgSpacing = (effectiveSpacing.horizontal + effectiveSpacing.vertical) / 2;
                    matrixStyle.gap = `${Math.max(avgSpacing, spacing.adaptiveMin)}px`;
                } else {
                    matrixStyle.gap = `${Math.max(effectiveSpacing.vertical, spacing.adaptiveMin)}px ${Math.max(effectiveSpacing.horizontal, spacing.adaptiveMin)}px`;
                }
                matrixStyle.padding = `${spacing.outer}px`;
                break;
                
            case 'margin':
                // Mode margin sur les cellules
                matrixStyle.gap = '0';
                matrixStyle.padding = `${spacing.outer}px`;
                this.spacingMode = 'margin';
                this.effectiveSpacing = effectiveSpacing;
                break;
                
            case 'padding':
                // Mode padding sur les cellules
                matrixStyle.gap = '0';
                matrixStyle.padding = `${spacing.outer}px`;
                this.spacingMode = 'padding';
                this.effectiveSpacing = effectiveSpacing;
                break;
                
            case 'border':
                // Mode border transparent sur les cellules
                matrixStyle.gap = '0';
                matrixStyle.padding = `${spacing.outer}px`;
                this.spacingMode = 'border';
                this.effectiveSpacing = effectiveSpacing;
                break;
                
            default:
                // Fallback to gap
                matrixStyle.gap = `${Math.max(effectiveSpacing.vertical, spacing.adaptiveMin)}px ${Math.max(effectiveSpacing.horizontal, spacing.adaptiveMin)}px`;
                matrixStyle.padding = `${spacing.outer}px`;
        }
    }

    _calculateResponsiveSpacing(spacing) {
        if (!spacing.responsive) {
            return {
                horizontal: spacing.horizontal,
                vertical: spacing.vertical
            };
        }
        
        // Responsive logic based on viewport and matrix size
        const viewportWidth = window.innerWidth;
        const matrixRect = this.element?.getBoundingClientRect();
        const matrixWidth = matrixRect?.width || 300;
        
        // Scale factor based on matrix size relative to viewport
        const scaleFactor = Math.min(1.5, Math.max(0.5, matrixWidth / (viewportWidth * 0.3)));
        
        return {
            horizontal: Math.round(spacing.horizontal * scaleFactor),
            vertical: Math.round(spacing.vertical * scaleFactor)
        };
    }

    _createCells() {
        for (let y = 1; y <= this.config.grid.y; y++) {
            for (let x = 1; x <= this.config.grid.x; x++) {
                this._createCell(x, y);
            }
        }
    }

    _createCell(x, y) {
        const cellId = `${this.id}_${x}_${y}`;
        
        const cell = document.createElement('div');
        cell.className = 'matrix-cell';
        cell.id = cellId;
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.dataset.matrixId = this.id;
        
        // Apply cell styling
        Object.assign(cell.style, this.config.cellStyle);
        
        // Apply spacing according to spacing mode
        this._applyCellSpacing(cell, x, y);
        
        // Add cell content (optional - shows coordinates)
        cell.textContent = `${x},${y}`;
        
        // Store cell data
        const cellData = {
            id: cellId,
            x: x,
            y: y,
            element: cell,
            selected: false,
            originalStyle: {...this.config.cellStyle}
        };
        
        this.cells.set(cellId, cellData);
        
        // Setup cell event handlers
        this._setupCellEventHandlers(cell, cellData);
        
        this.element.appendChild(cell);
        return cell;
    }

    _applyCellSpacing(cell, x, y) {
        const spacing = this.config.spacing;
        const effectiveSpacing = this.effectiveSpacing || { horizontal: spacing.horizontal, vertical: spacing.vertical };
        
        // NEW: Check for reduced motion preference for cell animations
        const shouldAnimate = spacing.animate && spacing.reduceMotion && 
            !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        // Enhanced animation support for cell spacing changes with staggered delays
        if (shouldAnimate) {
            const easingFunction = this._getEasingFunction(spacing.animationEasing);
            const cellDelay = spacing.animationDelay * ((x - 1) + (y - 1) * this.config.grid.x);
            const duration = spacing.animationDuration;
            
            cell.style.transition = `margin ${duration}ms ${easingFunction} ${cellDelay}ms, padding ${duration}ms ${easingFunction} ${cellDelay}ms, border ${duration}ms ${easingFunction} ${cellDelay}ms`;
            
            // Performance optimization
            if (spacing.optimizeRendering) {
                cell.style.willChange = 'margin, padding, border';
                // Clean up will-change after animation
                setTimeout(() => {
                    cell.style.willChange = 'auto';
                }, duration + cellDelay + 100);
            }
        }
        
        // Add debug mode visual indicators for cells
        if (spacing.debugMode) {
            cell.style.boxShadow = 'inset 0 0 0 1px rgba(255, 107, 107, 0.5)';
        }
        
        // NEW: Apply gradient spacing if enabled
        if (this.spacingMode === 'gradient') {
            this._applyGradientCellSpacing(cell, x, y, effectiveSpacing);
        } else {
            this._applyStandardCellSpacing(cell, x, y, effectiveSpacing);
        }
        
        // NEW: Add semantic cell labeling
        if (spacing.semanticLabels) {
            cell.setAttribute('aria-label', `Cell at position ${x}, ${y} with ${this.spacingMode} spacing`);
        }
    }

    _applyGradientCellSpacing(cell, x, y, baseSpacing) {
        const { direction, intensity } = this.gradientInfo;
        const spacing = this.config.spacing;
        const gridX = this.config.grid.x;
        const gridY = this.config.grid.y;
        
        let spacingMultiplier = 1;
        
        switch (direction) {
            case 'horizontal':
                // Spacing increases from left to right
                spacingMultiplier = 1 + (intensity * (x - 1) / (gridX - 1));
                break;
            case 'vertical':
                // Spacing increases from top to bottom
                spacingMultiplier = 1 + (intensity * (y - 1) / (gridY - 1));
                break;
            case 'radial':
                // Spacing increases from center outward
                const centerX = (gridX + 1) / 2;
                const centerY = (gridY + 1) / 2;
                const maxDistance = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));
                const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                spacingMultiplier = 1 + (intensity * distance / maxDistance);
                break;
            case 'inverse-radial':
                // Spacing decreases from center outward
                const centerX2 = (gridX + 1) / 2;
                const centerY2 = (gridY + 1) / 2;
                const maxDistance2 = Math.sqrt(Math.pow(centerX2, 2) + Math.pow(centerY2, 2));
                const distance2 = Math.sqrt(Math.pow(x - centerX2, 2) + Math.pow(y - centerY2, 2));
                spacingMultiplier = 1 + (intensity * (1 - distance2 / maxDistance2));
                break;
        }
        
        // Apply gradient-adjusted margin spacing
        const adjustedHorizontal = baseSpacing.horizontal * spacingMultiplier;
        const adjustedVertical = baseSpacing.vertical * spacingMultiplier;
        
        const marginTop = y === 1 ? 0 : Math.max(adjustedVertical / 2, spacing.adaptiveMin / 2);
        const marginBottom = y === gridY ? 0 : Math.max(adjustedVertical / 2, spacing.adaptiveMin / 2);
        const marginLeft = x === 1 ? 0 : Math.max(adjustedHorizontal / 2, spacing.adaptiveMin / 2);
        const marginRight = x === gridX ? 0 : Math.max(adjustedHorizontal / 2, spacing.adaptiveMin / 2);
        
        cell.style.margin = `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`;
    }

    _applyStandardCellSpacing(cell, x, y, effectiveSpacing) {
        const spacing = this.config.spacing;
        
        if (this.spacingMode === 'margin') {
            // Calcul des marges pour éviter les doublements avec adaptive minimum
            const marginTop = y === 1 ? 0 : Math.max(effectiveSpacing.vertical / 2, spacing.adaptiveMin / 2);
            const marginBottom = y === this.config.grid.y ? 0 : Math.max(effectiveSpacing.vertical / 2, spacing.adaptiveMin / 2);
            const marginLeft = x === 1 ? 0 : Math.max(effectiveSpacing.horizontal / 2, spacing.adaptiveMin / 2);
            const marginRight = x === this.config.grid.x ? 0 : Math.max(effectiveSpacing.horizontal / 2, spacing.adaptiveMin / 2);
            
            cell.style.margin = `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`;
            
        } else if (this.spacingMode === 'padding') {
            // Padding uniforme sur chaque cellule avec adaptive minimum
            const paddingH = Math.max(effectiveSpacing.horizontal / 2, spacing.adaptiveMin / 2);
            const paddingV = Math.max(effectiveSpacing.vertical / 2, spacing.adaptiveMin / 2);
            cell.style.padding = `${paddingV}px ${paddingH}px`;
            
        } else if (this.spacingMode === 'border') {
            // Border transparent pour créer l'espacement avec adaptive minimum
            const borderWidth = Math.max(
                Math.max(effectiveSpacing.horizontal, effectiveSpacing.vertical) / 2,
                spacing.adaptiveMin / 2
            );
            cell.style.border = `${borderWidth}px solid transparent`;
            cell.style.backgroundClip = 'padding-box';
        }
    }

    _setupCellEventHandlers(cell, cellData) {
        let clickTimer = null;
        let longClickTimer = null;
        let isLongClick = false;
        let clickCount = 0;

        // Mouse down
        cell.addEventListener('mousedown', (e) => {
            isLongClick = false;
            
            // Start long click timer
            longClickTimer = setTimeout(() => {
                isLongClick = true;
                this.config.callbacks.onLongClick(
                    cellData.id, 
                    cellData.x, 
                    cellData.y, 
                    cellData, 
                    e
                );
            }, this.config.longClickDuration);
            
            // Call mousedown callback
            this.config.callbacks.onMouseDown(
                cellData.id, 
                cellData.x, 
                cellData.y, 
                cellData, 
                e
            );
        });

        // Mouse up
        cell.addEventListener('mouseup', (e) => {
            // Clear long click timer
            if (longClickTimer) {
                clearTimeout(longClickTimer);
                longClickTimer = null;
            }
            
            // Call mouseup callback
            this.config.callbacks.onMouseUp(
                cellData.id, 
                cellData.x, 
                cellData.y, 
                cellData, 
                e
            );
        });

        // Click handler
        cell.addEventListener('click', (e) => {
            // Don't trigger click if it was a long click
            if (isLongClick) {
                isLongClick = false;
                return;
            }
            
            clickCount++;
            
            if (clickCount === 1) {
                clickTimer = setTimeout(() => {
                    // Single click
                    this.config.callbacks.onClick(
                        cellData.id, 
                        cellData.x, 
                        cellData.y, 
                        cellData, 
                        e
                    );
                    clickCount = 0;
                }, 300); // Wait for potential double click
            } else if (clickCount === 2) {
                // Double click
                clearTimeout(clickTimer);
                this.config.callbacks.onDoubleClick(
                    cellData.id, 
                    cellData.x, 
                    cellData.y, 
                    cellData, 
                    e
                );
                clickCount = 0;
            }
        });

        // Hover effects
        cell.addEventListener('mouseenter', (e) => {
            if (!cellData.selected) {
                Object.assign(cell.style, this.config.cellHoverStyle);
            }
            
            this.config.callbacks.onHover(
                cellData.id, 
                cellData.x, 
                cellData.y, 
                cellData, 
                e
            );
        });

        cell.addEventListener('mouseleave', (e) => {
            if (!cellData.selected) {
                Object.assign(cell.style, cellData.originalStyle);
            }
        });
    }

    _setupEventHandlers() {
        // Handle mouse leave to clean up timers
        this.element.addEventListener('mouseleave', () => {
            // This could be extended for global matrix events
        });
    }

    _setupResizeObserver() {
        if (!this.isPercentageSize) return;
        
        // Create global resize observer if it doesn't exist
        if (!Matrix.resizeObserver) {
            Matrix.resizeObserver = new ResizeObserver((entries) => {
                Matrix.matrices.forEach(matrix => {
                    if (matrix.isPercentageSize) {
                        matrix._handleResize();
                    }
                });
            });
            
            // Observe the document body for window resize
            Matrix.resizeObserver.observe(document.body);
        }
    }

    _handleResize() {
        const rect = this.element.getBoundingClientRect();
        this.config.callbacks.onResize(this, rect.width, rect.height);
    }

    // Public API Methods

    /**
     * Get a cell by its ID
     */
    getCellById(cellId) {
        return this.cells.get(cellId);
    }

    /**
     * Get a cell by coordinates
     */
    getCellByCoordinates(x, y) {
        const cellId = `${this.id}_${x}_${y}`;
        return this.cells.get(cellId);
    }

    /**
     * Select a cell
     */
    selectCell(x, y) {
        const cellData = this.getCellByCoordinates(x, y);
        if (cellData && !cellData.selected) {
            cellData.selected = true;
            this.selectedCells.add(cellData.id);
            Object.assign(cellData.element.style, this.config.cellSelectedStyle);
            console.log(`🔲 Cell selected: ${cellData.id}`);
        }
    }

    /**
     * Deselect a cell
     */
    deselectCell(x, y) {
        const cellData = this.getCellByCoordinates(x, y);
        if (cellData && cellData.selected) {
            cellData.selected = false;
            this.selectedCells.delete(cellData.id);
            Object.assign(cellData.element.style, cellData.originalStyle);
            console.log(`🔲 Cell deselected: ${cellData.id}`);
        }
    }

    /**
     * Select all cells
     */
    selectAll() {
        this.cells.forEach((cellData) => {
            if (!cellData.selected) {
                cellData.selected = true;
                this.selectedCells.add(cellData.id);
                Object.assign(cellData.element.style, this.config.cellSelectedStyle);
            }
        });
        console.log(`🔲 All cells selected in ${this.id}`);
    }

    /**
     * Deselect all cells
     */
    deselectAll() {
        this.cells.forEach((cellData) => {
            if (cellData.selected) {
                cellData.selected = false;
                Object.assign(cellData.element.style, cellData.originalStyle);
            }
        });
        this.selectedCells.clear();
        console.log(`🔲 All cells deselected in ${this.id}`);
    }

    /**
     * Set custom style for a specific cell
     */
    setCellStyle(x, y, style) {
        const cellData = this.getCellByCoordinates(x, y);
        if (cellData) {
            Object.assign(cellData.element.style, style);
            // Update original style if not selected
            if (!cellData.selected) {
                Object.assign(cellData.originalStyle, style);
            }
        }
    }

    /**
     * Reset cell style to default
     */
    resetCellStyle(x, y) {
        const cellData = this.getCellByCoordinates(x, y);
        if (cellData) {
            const defaultStyle = {...this.config.cellStyle};
            Object.assign(cellData.element.style, defaultStyle);
            cellData.originalStyle = defaultStyle;
        }
    }

    /**
     * Get all selected cells
     */
    getSelectedCells() {
        return Array.from(this.selectedCells).map(id => this.cells.get(id));
    }

    /**
     * Get all cells
     */
    getAllCells() {
        return Array.from(this.cells.values());
    }

    /**
     * Resize the matrix
     */
    resize(newSize) {
        if (newSize.width) {
            this.config.size.width = newSize.width;
            this.element.style.width = newSize.width;
        }
        if (newSize.height) {
            this.config.size.height = newSize.height;
            this.element.style.height = newSize.height;
        }
        
        this.isPercentageSize = this._isPercentageSize();
        this._setupResizeObserver();
        
        console.log(`🔲 Matrix ${this.id} resized to ${this.config.size.width} x ${this.config.size.height}`);
    }

    /**
     * Move the matrix to new position
     */
    moveTo(x, y) {
        this.config.position.x = x;
        this.config.position.y = y;
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
    }

    /**
     * Change grid dimensions (recreates cells)
     */
    setGridSize(x, y) {
        this.config.grid.x = x;
        this.config.grid.y = y;
        
        // Clear existing cells
        this.cells.clear();
        this.selectedCells.clear();
        this.element.innerHTML = '';
        
        // Update grid template
        this.element.style.gridTemplateColumns = `repeat(${x}, 1fr)`;
        this.element.style.gridTemplateRows = `repeat(${y}, 1fr)`;
        
        // Recreate cells
        this._createCells();
        
        console.log(`🔲 Matrix ${this.id} grid changed to ${x}x${y}`);
    }

    /**
     * Destroy the matrix
     */
    destroy() {
        this.element.remove();
        Matrix.matrices.delete(this.id);
        
        // If this was the last matrix with percentage size, disconnect observer
        const hasPercentageMatrices = Array.from(Matrix.matrices.values())
            .some(matrix => matrix.isPercentageSize);
        
        if (!hasPercentageMatrices && Matrix.resizeObserver) {
            Matrix.resizeObserver.disconnect();
            Matrix.resizeObserver = null;
        }
        
        console.log(`🗑️ Matrix destroyed: ${this.id}`);
    }

    /**
     * Enhanced spacing configuration update with batch processing and performance optimization
     */
    setSpacing(newSpacing, options = {}) {
        const { 
            skipAnimation = false, 
            batchUpdate = true,
            triggerResize = false 
        } = options;
        
        // Store old spacing for comparison
        const oldSpacing = { ...this.config.spacing };
        
        // Update configuration
        Object.assign(this.config.spacing, newSpacing);
        
        // Temporarily disable animations if requested
        const originalAnimate = this.config.spacing.animate;
        if (skipAnimation) {
            this.config.spacing.animate = false;
        }
        
        // Batch DOM updates for better performance
        if (batchUpdate) {
            this._batchSpacingUpdate(oldSpacing);
        } else {
            this._immediateSpacingUpdate();
        }
        
        // Restore original animation setting
        this.config.spacing.animate = originalAnimate;
        
        // Trigger responsive recalculation if needed
        if (triggerResize && this.config.spacing.responsive) {
            this._handleResize();
        }
        
        console.log(`🔲 Enhanced spacing updated for matrix ${this.id}:`, this.config.spacing);
    }

    _batchSpacingUpdate(oldSpacing) {
        // Use requestAnimationFrame for smooth updates
        requestAnimationFrame(() => {
            // Apply container styles
            const matrixStyle = {};
            this._applySpacingMethod(matrixStyle);
            Object.assign(this.element.style, matrixStyle);
            
            // Batch cell updates using DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
            const cellsToUpdate = [];
            
            this.cells.forEach((cellData) => {
                cellsToUpdate.push(cellData);
            });
            
            // Process cells in chunks to avoid blocking the main thread
            this._processCellsInChunks(cellsToUpdate, 0);
        });
    }

    _processCellsInChunks(cells, startIndex, chunkSize = 10) {
        const endIndex = Math.min(startIndex + chunkSize, cells.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const cellData = cells[i];
            this._resetAndApplyCellSpacing(cellData);
        }
        
        if (endIndex < cells.length) {
            // Process next chunk on next frame
            requestAnimationFrame(() => {
                this._processCellsInChunks(cells, endIndex, chunkSize);
            });
        }
    }

    _resetAndApplyCellSpacing(cellData) {
        // Reset spacing styles
        cellData.element.style.margin = '';
        cellData.element.style.padding = '';
        cellData.element.style.border = '';
        cellData.element.style.backgroundClip = '';
        cellData.element.style.boxShadow = '';
        cellData.element.style.transition = '';
        
        // Reapply base styles
        Object.assign(cellData.element.style, cellData.originalStyle);
        
        // Reapply spacing
        this._applyCellSpacing(cellData.element, cellData.x, cellData.y);
    }

    _immediateSpacingUpdate() {
        // Immediate update without batching (for real-time feedback)
        const matrixStyle = {};
        this._applySpacingMethod(matrixStyle);
        Object.assign(this.element.style, matrixStyle);
        
        this.cells.forEach((cellData) => {
            this._resetAndApplyCellSpacing(cellData);
        });
    }

    /**
     * Apply advanced spacing presets
     */
    applySpacingPreset(presetName, customOverrides = {}) {
        const presets = Matrix.getSpacingPresets();
        const preset = presets[presetName];
        
        if (!preset) {
            console.warn(`🔲 Unknown spacing preset: ${presetName}`);
            return;
        }
        
        // Merge preset with custom overrides
        const spacingConfig = { ...preset, ...customOverrides };
        
        // Apply with optimized batch update
        this.setSpacing(spacingConfig, { batchUpdate: true });
        
        console.log(`🔲 Applied spacing preset "${presetName}" to matrix ${this.id}`);
    }

    /**
     * Validate spacing configuration
     */
    validateSpacing(spacing) {
        const errors = [];
        
        if (spacing.horizontal < 0) errors.push('Horizontal spacing cannot be negative');
        if (spacing.vertical < 0) errors.push('Vertical spacing cannot be negative');
        if (spacing.outer < 0) errors.push('Outer spacing cannot be negative');
        if (spacing.adaptiveMin < 0) errors.push('Adaptive minimum cannot be negative');
        
        if (!['gap', 'margin', 'padding', 'border'].includes(spacing.mode)) {
            errors.push('Invalid spacing mode. Must be: gap, margin, padding, or border');
        }
        
        if (spacing.mode === 'border' && Math.max(spacing.horizontal, spacing.vertical) > 10) {
            errors.push('Border mode is not recommended for spacing > 10px');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Get spacing performance metrics with enhanced analysis
     */
    getSpacingMetrics() {
        const cellCount = this.cells.size;
        const spacingMode = this.config.spacing.mode;
        const isResponsive = this.config.spacing.responsive;
        const hasAnimation = this.config.spacing.animate;
        const hasGradient = this.config.spacing.gradient;
        const customEasing = this.config.spacing.animationEasing !== 'ease';
        
        // Calculate performance score (0-100) with enhanced factors
        let performanceScore = 100;
        if (spacingMode !== 'gap') performanceScore -= 20;
        if (isResponsive) performanceScore -= 15;
        if (hasAnimation) performanceScore -= 10;
        if (hasGradient) performanceScore -= 15; // NEW: Gradient impact
        if (customEasing) performanceScore -= 5; // NEW: Custom easing impact
        if (cellCount > 50) performanceScore -= Math.min(30, (cellCount - 50) * 0.5);
        
        // NEW: Bonus points for optimization features
        if (this.config.spacing.optimizeRendering) performanceScore += 5;
        if (this.config.spacing.reduceMotion) performanceScore += 3;
        
        return {
            cellCount,
            spacingMode,
            isResponsive,
            hasAnimation,
            hasGradient,
            customEasing,
            optimizeRendering: this.config.spacing.optimizeRendering,
            reduceMotion: this.config.spacing.reduceMotion,
            performanceScore: Math.max(0, Math.min(100, performanceScore)),
            recommendations: this._getPerformanceRecommendations(performanceScore),
            memoryUsage: this._estimateMemoryUsage(),
            renderingComplexity: this._calculateRenderingComplexity()
        };
    }

    _getPerformanceRecommendations(score) {
        const recommendations = [];
        const spacing = this.config.spacing;
        
        if (score < 70) {
            recommendations.push('Consider using "gap" mode for better performance');
        }
        if (spacing.responsive && this.cells.size > 30) {
            recommendations.push('Disable responsive spacing for large grids');
        }
        if (spacing.animate && this.cells.size > 50) {
            recommendations.push('Disable animations for large cell counts');
        }
        if (spacing.gradient && this.cells.size > 25) {
            recommendations.push('Gradient spacing adds complexity - consider uniform spacing');
        }
        if (!spacing.optimizeRendering && (spacing.animate || spacing.gradient)) {
            recommendations.push('Enable rendering optimization for better performance');
        }
        if (spacing.animationDelay > 0 && this.cells.size > 20) {
            recommendations.push('Reduce animation delay for large matrices');
        }
        
        return recommendations;
    }

    _estimateMemoryUsage() {
        const baseUsage = this.cells.size * 0.5; // KB per cell
        let additionalUsage = 0;
        
        if (this.config.spacing.animate) additionalUsage += this.cells.size * 0.2;
        if (this.config.spacing.gradient) additionalUsage += this.cells.size * 0.3;
        if (this.config.spacing.responsive) additionalUsage += 0.5;
        
        return Math.round((baseUsage + additionalUsage) * 100) / 100; // KB
    }

    _calculateRenderingComplexity() {
        let complexity = 1;
        
        if (this.config.spacing.mode !== 'gap') complexity += 0.5;
        if (this.config.spacing.animate) complexity += 0.3;
        if (this.config.spacing.gradient) complexity += 0.7;
        if (this.config.spacing.responsive) complexity += 0.4;
        if (this.config.spacing.debugMode) complexity += 0.2;
        
        return Math.round(complexity * 100) / 100;
    }

    /**
     * NEW: Advanced spacing analysis and optimization suggestions
     */
    analyzeSpacingPerformance() {
        const metrics = this.getSpacingMetrics();
        const analysis = {
            ...metrics,
            bottlenecks: [],
            optimizations: [],
            timestamp: Date.now()
        };
        
        // Identify performance bottlenecks
        if (metrics.cellCount > 100) {
            analysis.bottlenecks.push('Large cell count may impact performance');
        }
        if (metrics.hasGradient && metrics.hasAnimation) {
            analysis.bottlenecks.push('Gradient + animation combination is computationally expensive');
        }
        if (this.config.spacing.animationDelay > 0 && metrics.cellCount > 30) {
            analysis.bottlenecks.push('Staggered animations with many cells cause long animation sequences');
        }
        
        // Suggest specific optimizations
        if (!this.config.spacing.optimizeRendering && (metrics.hasAnimation || metrics.hasGradient)) {
            analysis.optimizations.push('Enable optimizeRendering for GPU acceleration');
        }
        if (metrics.customEasing && metrics.cellCount > 50) {
            analysis.optimizations.push('Use simpler easing functions for better performance');
        }
        if (metrics.isResponsive && window.innerWidth < 768) {
            analysis.optimizations.push('Consider disabling responsive spacing on mobile devices');
        }
        
        return analysis;
    }

    /**
     * NEW: Auto-optimize spacing configuration based on current conditions
     */
    autoOptimizeSpacing() {
        const analysis = this.analyzeSpacingPerformance();
        const optimizations = [];
        
        // Apply automatic optimizations
        if (analysis.performanceScore < 60) {
            if (this.config.spacing.mode !== 'gap' && this.cells.size < 30) {
                this.setSpacing({ mode: 'gap' });
                optimizations.push('Switched to gap mode for better performance');
            }
            
            if (this.config.spacing.animate && this.cells.size > 50) {
                this.setSpacing({ animate: false });
                optimizations.push('Disabled animations for large matrix');
            }
            
            if (this.config.spacing.gradient && this.cells.size > 40) {
                this.setSpacing({ gradient: false });
                optimizations.push('Disabled gradient spacing for large matrix');
            }
        }
        
        // Enable performance optimizations
        if (!this.config.spacing.optimizeRendering) {
            this.setSpacing({ optimizeRendering: true });
            optimizations.push('Enabled rendering optimization');
        }
        
        console.log(`🚀 Auto-optimization applied to ${this.id}:`, optimizations);
        return {
            optimizationsApplied: optimizations,
            newScore: this.getSpacingMetrics().performanceScore
        };
    }
}

export default Matrix;
