// Renderer Module - Canvas drawing and camera management
import { CONFIG } from './game.js';

export class Renderer {
    constructor(game) {
        this.game = game;
        this.ctx = game.ctx;
        this.canvas = game.canvas;
        
        // Camera
        this.camera = {
            x: CONFIG.MAP_WIDTH / 2,
            y: CONFIG.MAP_HEIGHT / 2,
            zoom: 1,
            minZoom: 0.3,
            maxZoom: 2
        };
        
        // Viewport dimensions
        this.viewWidth = 0;
        this.viewHeight = 0;
        
        // Terrain noise (pre-generated for performance)
        this.terrainCanvas = null;
        this.generateTerrain();
    }
    
    updateViewport() {
        this.viewWidth = this.canvas.width;
        this.viewHeight = this.canvas.height;
        this.generateTerrain();
    }
    
    generateTerrain() {
        // Create offscreen canvas for terrain - Dark WW1 dithered style
        this.terrainCanvas = document.createElement('canvas');
        this.terrainCanvas.width = CONFIG.MAP_WIDTH;
        this.terrainCanvas.height = CONFIG.MAP_HEIGHT;
        const tctx = this.terrainCanvas.getContext('2d');
        
        // Disable image smoothing for pixel-perfect look
        tctx.imageSmoothingEnabled = false;
        
        // Create dithered grass pattern
        this.drawDitheredGrass(tctx);
        
        // No man's land (muddy strip in the middle)
        const noMansLandWidth = 400;
        const centerX = CONFIG.MAP_WIDTH / 2;
        
        // Draw dithered mud
        this.drawDitheredMud(tctx, centerX, noMansLandWidth);
        
        // Crater patterns in no man's land
        this.addCraters(tctx, centerX, noMansLandWidth);
        
        // Train tracks on both sides
        this.drawTrainTracks(tctx);
        
        // Add trees with shadows
        this.addVegetation(tctx);
    }
    
    drawDitheredGrass(ctx) {
        // Create dithered checkerboard pattern like Cannon Fodder
        const colors = [
            CONFIG.COLORS.GRASS_1,
            CONFIG.COLORS.GRASS_2,
            CONFIG.COLORS.GRASS_3,
            CONFIG.COLORS.GRASS_4
        ];
        
        const pixelSize = 4; // Size of each "pixel"
        
        for (let y = 0; y < CONFIG.MAP_HEIGHT; y += pixelSize) {
            for (let x = 0; x < CONFIG.MAP_WIDTH; x += pixelSize) {
                // Dithered pattern based on position
                const pattern = ((x / pixelSize) + (y / pixelSize)) % 2;
                const noise = Math.random();
                
                let colorIdx;
                if (pattern === 0) {
                    colorIdx = noise < 0.7 ? 0 : 1;
                } else {
                    colorIdx = noise < 0.7 ? 1 : (noise < 0.9 ? 2 : 3);
                }
                
                ctx.fillStyle = colors[colorIdx];
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
    }
    
    drawDitheredMud(ctx, centerX, width) {
        const colors = [
            CONFIG.COLORS.MUD,
            CONFIG.COLORS.MUD_DARK,
            CONFIG.COLORS.MUD_LIGHT
        ];
        
        const pixelSize = 4;
        const startX = centerX - width / 2;
        const endX = centerX + width / 2;
        
        for (let y = 0; y < CONFIG.MAP_HEIGHT; y += pixelSize) {
            for (let x = startX; x < endX; x += pixelSize) {
                const distFromCenter = Math.abs(x - centerX) / (width / 2);
                const pattern = ((x / pixelSize) + (y / pixelSize)) % 2;
                const noise = Math.random();
                
                let colorIdx;
                // Darker in center
                if (distFromCenter < 0.3) {
                    colorIdx = pattern === 0 ? 1 : (noise < 0.7 ? 1 : 0);
                } else {
                    colorIdx = pattern === 0 ? 0 : (noise < 0.5 ? 0 : 2);
                }
                
                ctx.fillStyle = colors[colorIdx];
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
    }
    
    addVegetation(ctx) {
        // Add trees on the sides - darker, more ominous WW1 style
        const treeAreas = [
            { xMin: 100, xMax: 300, density: 20 },
            { xMin: CONFIG.MAP_WIDTH - 300, xMax: CONFIG.MAP_WIDTH - 100, density: 20 }
        ];
        
        for (const area of treeAreas) {
            for (let i = 0; i < area.density; i++) {
                const x = area.xMin + Math.random() * (area.xMax - area.xMin);
                const y = Math.random() * CONFIG.MAP_HEIGHT;
                this.drawTree(ctx, x, y);
            }
        }
    }
    
    drawTree(ctx, x, y) {
        // Dark WW1 style tree - autumn/dead looking
        const size = 20 + Math.random() * 15;
        
        // Dark shadow underneath
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(x + 5, y + size * 0.4, size * 0.7, size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Tree trunk (visible from top-down)
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.fillRect(x - 3, y - 2, 6, 8);
        
        // Tree canopy - dithered brown/dark green (autumn/dead)
        const pixelSize = 3;
        for (let py = -size; py < size * 0.3; py += pixelSize) {
            for (let px = -size; px < size; px += pixelSize) {
                const dist = Math.sqrt(px * px + py * py);
                if (dist < size * (0.8 + Math.random() * 0.2)) {
                    const dither = ((px + py) / pixelSize) % 2;
                    ctx.fillStyle = dither === 0 ? 
                        CONFIG.COLORS.TREE_LEAVES : 
                        CONFIG.COLORS.TREE_LEAVES_LIGHT;
                    ctx.fillRect(x + px, y + py, pixelSize, pixelSize);
                }
            }
        }
    }
    
    addCraters(ctx, centerX, width) {
        // Dark WW1 shell craters - muddy and grim
        for (let i = 0; i < 50; i++) {
            const x = centerX + (Math.random() - 0.5) * width * 0.95;
            const y = Math.random() * CONFIG.MAP_HEIGHT;
            const radius = 6 + Math.random() * 18;
            const hasWater = Math.random() < 0.5;
            
            // Crater rim - dithered
            const pixelSize = 3;
            for (let py = -radius - 4; py < radius + 4; py += pixelSize) {
                for (let px = -radius - 4; px < radius + 4; px += pixelSize) {
                    const dist = Math.sqrt(px * px + py * py);
                    if (dist < radius + 4 && dist > radius - 2) {
                        ctx.fillStyle = CONFIG.COLORS.MUD_DARK;
                        ctx.fillRect(x + px, y + py, pixelSize, pixelSize);
                    }
                }
            }
            
            // Crater interior
            if (hasWater) {
                // Murky water-filled crater
                for (let py = -radius; py < radius; py += pixelSize) {
                    for (let px = -radius; px < radius; px += pixelSize) {
                        const dist = Math.sqrt(px * px + py * py);
                        if (dist < radius) {
                            const dither = ((px + py) / pixelSize) % 2;
                            ctx.fillStyle = dither === 0 ? CONFIG.COLORS.WATER : '#1a2a3a';
                            ctx.fillRect(x + px, y + py, pixelSize, pixelSize);
                        }
                    }
                }
            } else {
                // Dark muddy crater
                ctx.fillStyle = '#1a1a0a';
                ctx.beginPath();
                ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawTrainTracks(ctx) {
        const trackY = CONFIG.MAP_HEIGHT / 2;
        
        // Player side tracks (left)
        this.drawTrackLine(ctx, 50, 0, 50, CONFIG.MAP_HEIGHT);
        
        // Enemy side tracks (right)
        this.drawTrackLine(ctx, CONFIG.MAP_WIDTH - 50, 0, CONFIG.MAP_WIDTH - 50, CONFIG.MAP_HEIGHT);
    }
    
    drawTrackLine(ctx, x1, y1, x2, y2) {
        // Rails
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        
        ctx.beginPath();
        ctx.moveTo(x1 - 8, y1);
        ctx.lineTo(x2 - 8, y2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(x1 + 8, y1);
        ctx.lineTo(x2 + 8, y2);
        ctx.stroke();
        
        // Ties
        ctx.strokeStyle = '#3d2b1f';
        ctx.lineWidth = 6;
        
        const length = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
        const ties = Math.floor(length / 30);
        
        for (let i = 0; i < ties; i++) {
            const t = i / ties;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            
            ctx.beginPath();
            ctx.moveTo(x - 15, y);
            ctx.lineTo(x + 15, y);
            ctx.stroke();
        }
    }
    
    // Camera controls
    pan(dx, dy) {
        this.camera.x += dx / this.camera.zoom;
        this.camera.y += dy / this.camera.zoom;
        
        // Clamp to map bounds
        this.camera.x = Math.max(0, Math.min(CONFIG.MAP_WIDTH, this.camera.x));
        this.camera.y = Math.max(0, Math.min(CONFIG.MAP_HEIGHT, this.camera.y));
    }
    
    zoom(delta, centerX, centerY) {
        const oldZoom = this.camera.zoom;
        this.camera.zoom *= delta > 0 ? 0.9 : 1.1;
        this.camera.zoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.zoom));
        
        // Zoom toward mouse position
        if (centerX !== undefined) {
            const worldX = this.screenToWorldX(centerX);
            const worldY = this.screenToWorldY(centerY);
            
            // Adjust camera to keep mouse position stable
            const newWorldX = this.screenToWorldX(centerX);
            const newWorldY = this.screenToWorldY(centerY);
            
            this.camera.x += worldX - newWorldX;
            this.camera.y += worldY - newWorldY;
        }
    }
    
    // Coordinate conversion
    screenToWorldX(screenX) {
        return (screenX - this.viewWidth / 2) / this.camera.zoom + this.camera.x;
    }
    
    screenToWorldY(screenY) {
        return (screenY - this.viewHeight / 2) / this.camera.zoom + this.camera.y;
    }
    
    worldToScreenX(worldX) {
        return (worldX - this.camera.x) * this.camera.zoom + this.viewWidth / 2;
    }
    
    worldToScreenY(worldY) {
        return (worldY - this.camera.y) * this.camera.zoom + this.viewHeight / 2;
    }
    
    // Main render function
    render() {
        const ctx = this.ctx;
        
        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
        
        // Save state and apply camera transform
        ctx.save();
        ctx.translate(this.viewWidth / 2, this.viewHeight / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);
        
        // Draw terrain
        if (this.terrainCanvas) {
            ctx.drawImage(this.terrainCanvas, 0, 0);
        }
        
        // Draw game elements
        this.game.trenchSystem.render(ctx);
        this.game.buildingManager.render(ctx);
        this.game.unitManager.render(ctx);
        this.game.trainSystem.render(ctx);
        
        // Draw effects
        this.renderEffects(ctx);
        
        // Draw selection box if dragging
        if (this.game.input.isDraggingSelection) {
            this.renderSelectionBox(ctx);
        }
        
        // Draw trench preview if drawing
        if (this.game.input.isDrawingTrench && this.game.input.trenchPoints.length > 0) {
            this.renderTrenchPreview(ctx);
        }
        
        // Draw wire preview if drawing
        if (this.game.input.isDrawingWire && this.game.input.wirePoints.length > 0) {
            this.renderWirePreview(ctx);
        }
        
        // Draw building preview
        if (this.game.input.buildPreview) {
            this.renderBuildPreview(ctx);
        }
        
        ctx.restore();
        
        // Draw minimap
        this.renderMinimap();
    }
    
    renderEffects(ctx) {
        for (const effect of this.game.effects) {
            const progress = effect.time / effect.duration;
            
            switch (effect.type) {
                case 'explosion':
                    this.renderExplosion(ctx, effect, progress);
                    break;
                case 'muzzle':
                    this.renderMuzzleFlash(ctx, effect, progress);
                    break;
                case 'dirt':
                    this.renderDirtPuff(ctx, effect, progress);
                    break;
                case 'blood':
                    this.renderBlood(ctx, effect, progress);
                    break;
                case 'shell_arc':
                    this.renderShellArc(ctx, effect, progress);
                    break;
            }
        }
    }
    
    renderShellArc(ctx, effect, progress) {
        // Draw artillery shell flying in an arc
        const startX = effect.x;
        const startY = effect.y;
        const endX = effect.targetX;
        const endY = effect.targetY;
        
        // Calculate arc position
        const t = progress;
        const x = startX + (endX - startX) * t;
        const baseY = startY + (endY - startY) * t;
        
        // Parabolic arc height
        const arcHeight = Math.min(200, Math.abs(endX - startX) * 0.15);
        const y = baseY - arcHeight * Math.sin(t * Math.PI);
        
        // Shell size decreases as it gets higher (perspective)
        const heightFactor = 1 - Math.sin(t * Math.PI) * 0.5;
        const size = effect.size * heightFactor;
        
        // Draw shell
        ctx.save();
        ctx.translate(x, y);
        
        // Rotate to face direction of travel
        const angle = Math.atan2(endY - startY, endX - startX);
        ctx.rotate(angle);
        
        // Shell body
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Nose
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(size + 4, -2);
        ctx.lineTo(size + 4, 2);
        ctx.closePath();
        ctx.fill();
        
        // Trail smoke
        ctx.fillStyle = `rgba(80, 70, 60, ${0.5 - progress * 0.3})`;
        ctx.beginPath();
        ctx.arc(-size - 2, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Draw target indicator (pulsing)
        if (progress > 0.5) {
            const pulseAlpha = (1 - progress) * 0.6 + Math.sin(progress * 20) * 0.2;
            ctx.strokeStyle = `rgba(255, 100, 50, ${pulseAlpha})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(endX, endY, 20 + (1 - progress) * 20, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    
    renderExplosion(ctx, effect, progress) {
        // Dark WW1 style explosion
        const size = effect.size * (1 + progress * 1.5);
        const alpha = 1 - progress;
        
        // Darker, grittier explosion colors
        const colors = ['#ff8822', '#dd4400', '#aa2200', '#441100'];
        const colorIdx = Math.floor(progress * 4) % colors.length;
        
        ctx.globalAlpha = alpha;
        
        // Smoke first (dark)
        ctx.fillStyle = `rgba(40, 30, 20, ${alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y - progress * 10, size * 1.2, 0, Math.PI * 2);
        ctx.fill();
        
        // Fire core
        ctx.fillStyle = colors[colorIdx];
        const blockSize = size * 0.5;
        ctx.fillRect(effect.x - blockSize/2, effect.y - blockSize/2, blockSize, blockSize);
        
        // Debris chunks
        const smallSize = size * 0.25;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + progress;
            const dist = size * (0.4 + progress * 1);
            const px = effect.x + Math.cos(angle) * dist;
            const py = effect.y + Math.sin(angle) * dist - progress * 15;
            ctx.fillStyle = i % 2 === 0 ? '#3a2a1a' : colors[colorIdx];
            ctx.fillRect(px - smallSize/2, py - smallSize/2, smallSize, smallSize);
        }
        
        ctx.globalAlpha = 1;
    }
    
    renderMuzzleFlash(ctx, effect, progress) {
        // Quick muzzle flash
        const size = effect.size * (1 - progress * 0.8);
        const alpha = 1 - progress;
        
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffaa44';
        ctx.fillRect(effect.x - size/2, effect.y - size/2, size, size);
        
        // Bright center
        ctx.fillStyle = '#ffdd88';
        ctx.fillRect(effect.x - size/4, effect.y - size/4, size/2, size/2);
        ctx.globalAlpha = 1;
    }
    
    renderDirtPuff(ctx, effect, progress) {
        // Dark dirt particles
        const alpha = (1 - progress) * 0.7;
        
        ctx.globalAlpha = alpha;
        
        // Multiple dirt chunks
        for (let i = 0; i < 5; i++) {
            const offsetX = (i - 2) * 5;
            const offsetY = -progress * 20 - i * 4;
            const size = 4 - progress * 3;
            ctx.fillStyle = i % 2 === 0 ? '#4a3a2a' : '#3a2a1a';
            ctx.fillRect(effect.x + offsetX - size/2, effect.y + offsetY - size/2, size, size);
        }
        
        ctx.globalAlpha = 1;
    }
    
    renderBlood(ctx, effect, progress) {
        // Dark blood splatter
        const alpha = 1 - progress * 0.4;
        
        // Dark blood pool
        ctx.fillStyle = `rgba(100, 0, 0, ${alpha})`;
        ctx.fillRect(effect.x - effect.size/2, effect.y - effect.size/2, effect.size, effect.size);
        
        // Splatter
        ctx.fillStyle = `rgba(80, 0, 0, ${alpha})`;
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + effect.x * 0.1;
            const dist = effect.size * (0.3 + progress * 0.4);
            const px = effect.x + Math.cos(angle) * dist;
            const py = effect.y + Math.sin(angle) * dist;
            ctx.fillRect(px - 1, py - 1, 3, 3);
        }
    }
    
    renderSelectionBox(ctx) {
        const input = this.game.input;
        const x1 = Math.min(input.selectionStart.x, input.selectionEnd.x);
        const y1 = Math.min(input.selectionStart.y, input.selectionEnd.y);
        const x2 = Math.max(input.selectionStart.x, input.selectionEnd.x);
        const y2 = Math.max(input.selectionStart.y, input.selectionEnd.y);
        
        ctx.strokeStyle = CONFIG.COLORS.SELECTION;
        ctx.lineWidth = 2 / this.camera.zoom;
        ctx.setLineDash([5 / this.camera.zoom, 5 / this.camera.zoom]);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    
    renderTrenchPreview(ctx) {
        const points = this.game.input.trenchPoints;
        if (points.length < 2) return;
        
        ctx.strokeStyle = 'rgba(138, 122, 90, 0.6)';
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([10, 10]);
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    renderWirePreview(ctx) {
        const points = this.game.input.wirePoints;
        if (points.length < 1) return;
        
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.6)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        // Also draw to current mouse position
        const input = this.game.input;
        ctx.lineTo(input.worldX, input.worldY);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    renderBuildPreview(ctx) {
        const preview = this.game.input.buildPreview;
        const canPlace = this.game.buildingManager.canPlace(preview.type, preview.x, preview.y);
        
        ctx.globalAlpha = 0.6;
        
        if (canPlace) {
            ctx.strokeStyle = '#00ff00';
        } else {
            ctx.strokeStyle = '#ff0000';
        }
        
        ctx.lineWidth = 3;
        
        switch (preview.type) {
            case 'machinegun':
                ctx.beginPath();
                ctx.arc(preview.x, preview.y, 25, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = canPlace ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
                ctx.fill();
                break;
            case 'artillery':
                ctx.beginPath();
                ctx.arc(preview.x, preview.y, 35, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = canPlace ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
                ctx.fill();
                break;
            case 'barbed':
                ctx.strokeRect(preview.x - 30, preview.y - 10, 60, 20);
                break;
        }
        
        ctx.globalAlpha = 1;
    }
    
    renderMinimap() {
        const minimap = document.getElementById('minimap');
        if (!minimap || minimap.classList.contains('hidden')) return;
        
        const mctx = minimap.getContext('2d');
        const mw = minimap.width;
        const mh = minimap.height;
        
        // Scale factors
        const sx = mw / CONFIG.MAP_WIDTH;
        const sy = mh / CONFIG.MAP_HEIGHT;
        
        // Clear with dark olive
        mctx.fillStyle = '#3a4a2a';
        mctx.fillRect(0, 0, mw, mh);
        
        // No man's land (brown strip)
        mctx.fillStyle = '#3a2a1a';
        mctx.fillRect(mw * 0.4, 0, mw * 0.2, mh);
        
        // Trenches (khaki lines)
        mctx.strokeStyle = '#8a7a5a';
        mctx.lineWidth = 2;
        for (const trench of this.game.trenchSystem.trenches) {
            if (trench.points.length < 2) continue;
            mctx.beginPath();
            mctx.moveTo(trench.points[0].x * sx, trench.points[0].y * sy);
            for (let i = 1; i < trench.points.length; i++) {
                mctx.lineTo(trench.points[i].x * sx, trench.points[i].y * sy);
            }
            mctx.stroke();
        }
        
        // Units as dots
        for (const unit of this.game.unitManager.units) {
            if (unit.state === 'dead') continue;
            mctx.fillStyle = unit.team === CONFIG.TEAM_PLAYER ? '#6a8a4a' : '#8a5a3a';
            mctx.fillRect(unit.x * sx - 1, unit.y * sy - 1, 2, 2);
        }
        
        // Buildings
        for (const building of this.game.buildingManager.buildings) {
            if (building.destroyed) continue;
            mctx.fillStyle = building.team === CONFIG.TEAM_PLAYER ? '#5a7a3a' : '#7a4a2a';
            if (building.type === 'hq') {
                mctx.fillRect(building.x * sx - 3, building.y * sy - 3, 6, 6);
            } else {
                mctx.fillRect(building.x * sx - 2, building.y * sy - 2, 4, 4);
            }
        }
        
        // Camera viewport
        const viewLeft = (this.camera.x - this.viewWidth / 2 / this.camera.zoom) * sx;
        const viewTop = (this.camera.y - this.viewHeight / 2 / this.camera.zoom) * sy;
        const viewW = (this.viewWidth / this.camera.zoom) * sx;
        const viewH = (this.viewHeight / this.camera.zoom) * sy;
        
        mctx.strokeStyle = '#c0b080';
        mctx.lineWidth = 1;
        mctx.strokeRect(viewLeft, viewTop, viewW, viewH);
    }
}

