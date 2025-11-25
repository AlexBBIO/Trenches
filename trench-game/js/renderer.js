// Renderer Module - Canvas drawing and camera management
// WWI Cannon Fodder style rendering
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
            maxZoom: 2.5
        };
        
        // Viewport dimensions
        this.viewWidth = 0;
        this.viewHeight = 0;
        
        // Terrain noise (pre-generated for performance)
        this.terrainCanvas = null;
        this.debrisPositions = [];
        this.craterPositions = [];
        this.deadTreePositions = [];
        
        // Animation time for effects
        this.time = 0;
        
        // Blood stains that persist on the terrain
        this.bloodStains = [];
        
        // Fog of War
        this.fogCanvas = null;
        this.fogCtx = null;
        this.fogGridSize = 20; // Size of each fog cell
        this.exploredCells = new Set(); // Cells that have been explored (light fog)
        this.visibleCells = new Set();  // Cells currently visible (no fog)
        
        this.generateTerrain();
        this.initFogOfWar();
    }
    
    initFogOfWar() {
        // Create fog canvas
        this.fogCanvas = document.createElement('canvas');
        this.fogCanvas.width = CONFIG.MAP_WIDTH;
        this.fogCanvas.height = CONFIG.MAP_HEIGHT;
        this.fogCtx = this.fogCanvas.getContext('2d');
        
        // Initialize all cells as unexplored (black fog)
        this.exploredCells.clear();
        this.visibleCells.clear();
    }
    
    // Convert world position to fog grid cell key
    getFogCellKey(x, y) {
        const cellX = Math.floor(x / this.fogGridSize);
        const cellY = Math.floor(y / this.fogGridSize);
        return `${cellX},${cellY}`;
    }
    
    // Update visibility based on units and buildings
    updateFogOfWar() {
        // Clear currently visible cells
        this.visibleCells.clear();
        
        // Get all player units and buildings
        const playerUnits = this.game.unitManager.units.filter(u => 
            u.team === CONFIG.TEAM_PLAYER && u.state !== 'dead'
        );
        
        const playerBuildings = this.game.buildingManager.buildings.filter(b => 
            b.team === CONFIG.TEAM_PLAYER && !b.destroyed && !b.isBlueprint
        );
        
        // Reveal cells around each unit
        for (const unit of playerUnits) {
            const visionRange = unit.type === 'soldier' ? CONFIG.VISION_SOLDIER : CONFIG.VISION_WORKER;
            this.revealArea(unit.x, unit.y, visionRange);
        }
        
        // Reveal cells around each building
        for (const building of playerBuildings) {
            let visionRange = CONFIG.VISION_BUILDING;
            if (building.type === 'hq') {
                visionRange = CONFIG.VISION_HQ;
            } else if (building.type === 'observation_post' && building.assignedUnit) {
                visionRange = CONFIG.VISION_OBSERVATION_POST;
            }
            this.revealArea(building.x, building.y, visionRange);
        }
    }
    
    // Reveal an area around a point
    revealArea(centerX, centerY, radius) {
        const cellRadius = Math.ceil(radius / this.fogGridSize);
        const centerCellX = Math.floor(centerX / this.fogGridSize);
        const centerCellY = Math.floor(centerY / this.fogGridSize);
        
        for (let dy = -cellRadius; dy <= cellRadius; dy++) {
            for (let dx = -cellRadius; dx <= cellRadius; dx++) {
                const cellX = centerCellX + dx;
                const cellY = centerCellY + dy;
                
                // Check if within circular radius
                const worldX = cellX * this.fogGridSize + this.fogGridSize / 2;
                const worldY = cellY * this.fogGridSize + this.fogGridSize / 2;
                const dist = Math.sqrt((worldX - centerX) ** 2 + (worldY - centerY) ** 2);
                
                if (dist <= radius) {
                    const key = `${cellX},${cellY}`;
                    this.visibleCells.add(key);
                    this.exploredCells.add(key);
                }
            }
        }
    }
    
    // Check if a position is visible to the player
    isPositionVisible(x, y) {
        // Scout flyover reveals everything
        if (this.game.scoutFlyover && this.game.scoutFlyover.active) {
            return true;
        }
        const key = this.getFogCellKey(x, y);
        return this.visibleCells.has(key);
    }
    
    // Check if a position has been explored
    isPositionExplored(x, y) {
        const key = this.getFogCellKey(x, y);
        return this.exploredCells.has(key);
    }
    
    // Render the fog of war layer
    renderFogOfWar(ctx) {
        // During scout flyover, show very light fog over unexplored areas
        const isScoutActive = this.game.scoutFlyover && this.game.scoutFlyover.active;
        
        const gridW = Math.ceil(CONFIG.MAP_WIDTH / this.fogGridSize);
        const gridH = Math.ceil(CONFIG.MAP_HEIGHT / this.fogGridSize);
        
        for (let gy = 0; gy < gridH; gy++) {
            for (let gx = 0; gx < gridW; gx++) {
                const key = `${gx},${gy}`;
                const x = gx * this.fogGridSize;
                const y = gy * this.fogGridSize;
                
                if (this.visibleCells.has(key)) {
                    // Fully visible - no fog
                    continue;
                } else if (isScoutActive) {
                    // Scout flyover - very light fog (can see everything)
                    ctx.fillStyle = 'rgba(20, 18, 15, 0.15)';
                    ctx.fillRect(x, y, this.fogGridSize, this.fogGridSize);
                } else if (this.exploredCells.has(key)) {
                    // Explored but not currently visible - light fog
                    ctx.fillStyle = 'rgba(20, 18, 15, 0.5)';
                    ctx.fillRect(x, y, this.fogGridSize, this.fogGridSize);
                } else {
                    // Unexplored - dark fog
                    ctx.fillStyle = 'rgba(10, 10, 8, 0.9)';
                    ctx.fillRect(x, y, this.fogGridSize, this.fogGridSize);
                }
            }
        }
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
        
        // Base grass layer with dithering
        this.drawDitheredGrass(tctx);
        
        // No man's land (muddy strip in the middle)
        const noMansLandWidth = 450;
        const centerX = CONFIG.MAP_WIDTH / 2;
        
        // Draw dithered mud for no man's land
        this.drawDitheredMud(tctx, centerX, noMansLandWidth);
        
        // Add shell craters with variety
        this.addCraters(tctx, centerX, noMansLandWidth);
        
        // Add debris scattered across no man's land
        this.addDebris(tctx, centerX, noMansLandWidth);
        
        // Train tracks on both sides
        this.drawTrainTracks(tctx);
        
        // Add trees with shadows - mix of alive and dead
        this.addVegetation(tctx);
        
        // Add dead trees in no man's land
        this.addDeadTrees(tctx, centerX, noMansLandWidth);
        
        // Add ruined structures
        this.addRuinedStructures(tctx, centerX, noMansLandWidth);
    }
    
    drawDitheredGrass(ctx) {
        // Create dithered checkerboard pattern like Cannon Fodder
        const colors = [
            CONFIG.COLORS.GRASS_1,
            CONFIG.COLORS.GRASS_2,
            CONFIG.COLORS.GRASS_3,
            CONFIG.COLORS.GRASS_4,
            CONFIG.COLORS.GRASS_DEAD
        ];
        
        const pixelSize = 4; // Size of each "pixel"
        
        for (let y = 0; y < CONFIG.MAP_HEIGHT; y += pixelSize) {
            for (let x = 0; x < CONFIG.MAP_WIDTH; x += pixelSize) {
                // Dithered pattern based on position with variation
                const pattern = ((Math.floor(x / pixelSize) + Math.floor(y / pixelSize)) % 2);
                const noise = Math.random();
                const noise2 = Math.sin(x * 0.01) * Math.cos(y * 0.01);
                
                let colorIdx;
                if (pattern === 0) {
                    colorIdx = noise < 0.6 ? 0 : (noise < 0.85 ? 1 : 2);
                } else {
                    colorIdx = noise < 0.5 ? 1 : (noise < 0.8 ? 2 : (noise < 0.95 ? 3 : 4));
                }
                
                // Add dead grass patches randomly
                if (noise2 > 0.7 && noise < 0.1) {
                    colorIdx = 4;
                }
                
                ctx.fillStyle = colors[colorIdx];
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
        
        // Add subtle grass texture lines
        ctx.strokeStyle = CONFIG.COLORS.GRASS_3;
        ctx.lineWidth = 1;
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * CONFIG.MAP_WIDTH;
            const y = Math.random() * CONFIG.MAP_HEIGHT;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 8, y - 4 - Math.random() * 6);
            ctx.stroke();
        }
    }
    
    drawDitheredMud(ctx, centerX, width) {
        const colors = [
            CONFIG.COLORS.MUD,
            CONFIG.COLORS.MUD_DARK,
            CONFIG.COLORS.MUD_LIGHT,
            CONFIG.COLORS.MUD_WET
        ];
        
        const pixelSize = 4;
        const startX = centerX - width / 2;
        const endX = centerX + width / 2;
        
        // Gradient edges - mud fades into grass
        const edgeFade = 50;
        
        for (let y = 0; y < CONFIG.MAP_HEIGHT; y += pixelSize) {
            for (let x = startX - edgeFade; x < endX + edgeFade; x += pixelSize) {
                const distFromCenter = Math.abs(x - centerX) / (width / 2);
                const distFromEdge = Math.min(
                    Math.abs(x - (startX - edgeFade)),
                    Math.abs(x - (endX + edgeFade))
                ) / edgeFade;
                
                // Skip if in fade zone with probability based on distance
                if (x < startX || x > endX) {
                    if (Math.random() > (1 - distFromEdge)) continue;
                }
                
                const pattern = ((Math.floor(x / pixelSize) + Math.floor(y / pixelSize)) % 2);
                const noise = Math.random();
                const waveNoise = Math.sin(y * 0.02 + x * 0.01) * 0.5 + 0.5;
                
                let colorIdx;
                // Darker in center, lighter at edges
                if (distFromCenter < 0.3) {
                    colorIdx = pattern === 0 ? 1 : (noise < 0.6 ? 1 : (noise < 0.9 ? 3 : 0));
                } else if (distFromCenter < 0.6) {
                    colorIdx = pattern === 0 ? 0 : (noise < 0.5 ? 0 : (noise < 0.8 ? 1 : 2));
                } else {
                    colorIdx = pattern === 0 ? 0 : (noise < 0.4 ? 2 : 0);
                }
                
                // Add wet patches
                if (waveNoise > 0.8 && noise < 0.3) {
                    colorIdx = 3;
                }
                
                ctx.fillStyle = colors[colorIdx];
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
        
        // Add mud splatter details
        ctx.fillStyle = CONFIG.COLORS.MUD_DARK;
        for (let i = 0; i < 100; i++) {
            const x = centerX + (Math.random() - 0.5) * width;
            const y = Math.random() * CONFIG.MAP_HEIGHT;
            const size = 2 + Math.random() * 6;
            ctx.fillRect(x, y, size, size);
        }
    }
    
    addVegetation(ctx) {
        // Add trees on the sides - darker, more ominous WW1 style
        // Mix of alive and damaged trees
        const treeAreas = [
            { xMin: 80, xMax: 280, density: 25 },
            { xMin: CONFIG.MAP_WIDTH - 280, xMax: CONFIG.MAP_WIDTH - 80, density: 25 }
        ];
        
        for (const area of treeAreas) {
            for (let i = 0; i < area.density; i++) {
                const x = area.xMin + Math.random() * (area.xMax - area.xMin);
                const y = Math.random() * CONFIG.MAP_HEIGHT;
                const isDamaged = Math.random() < 0.3;
                this.drawTree(ctx, x, y, isDamaged);
            }
        }
    }
    
    drawTree(ctx, x, y, isDamaged = false) {
        // Dark WW1 style tree - autumn/damaged looking
        const size = 18 + Math.random() * 12;
        
        // Dark shadow underneath
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(x + 4, y + size * 0.35, size * 0.6, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Tree trunk (visible from top-down)
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.fillRect(x - 3, y - 2, 6, 10);
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK_LIGHT;
        ctx.fillRect(x - 1, y - 1, 2, 8);
        
        if (isDamaged) {
            // Damaged tree - sparse canopy
            const pixelSize = 3;
            for (let py = -size * 0.8; py < size * 0.2; py += pixelSize) {
                for (let px = -size * 0.8; px < size * 0.8; px += pixelSize) {
                    const dist = Math.sqrt(px * px + py * py);
                    if (dist < size * 0.6 && Math.random() < 0.4) {
                        ctx.fillStyle = Math.random() < 0.5 ? 
                            CONFIG.COLORS.TREE_DEAD : CONFIG.COLORS.TREE_LEAVES;
                        ctx.fillRect(x + px, y + py, pixelSize, pixelSize);
                    }
                }
            }
        } else {
            // Full tree canopy - dithered brown/dark green (autumn)
            const pixelSize = 3;
            for (let py = -size; py < size * 0.25; py += pixelSize) {
                for (let px = -size; px < size; px += pixelSize) {
                    const dist = Math.sqrt(px * px + py * py);
                    if (dist < size * (0.75 + Math.random() * 0.2)) {
                        const dither = ((Math.floor(px / pixelSize) + Math.floor(py / pixelSize)) % 2);
                        ctx.fillStyle = dither === 0 ? 
                            CONFIG.COLORS.TREE_LEAVES : 
                            CONFIG.COLORS.TREE_LEAVES_LIGHT;
                        ctx.fillRect(x + px, y + py, pixelSize, pixelSize);
                    }
                }
            }
        }
    }
    
    addDeadTrees(ctx, centerX, width) {
        // Dead, shattered trees in no man's land
        this.deadTreePositions = [];
        
        for (let i = 0; i < 15; i++) {
            const x = centerX + (Math.random() - 0.5) * width * 0.8;
            const y = Math.random() * CONFIG.MAP_HEIGHT;
            this.deadTreePositions.push({ x, y });
            this.drawDeadTree(ctx, x, y);
        }
    }
    
    drawDeadTree(ctx, x, y) {
        // Shattered tree stump/trunk
        const height = 15 + Math.random() * 25;
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(x + 3, y + 5, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Main trunk - jagged top
        ctx.fillStyle = CONFIG.COLORS.TREE_DEAD;
        ctx.beginPath();
        ctx.moveTo(x - 4, y + 5);
        ctx.lineTo(x - 3, y - height);
        ctx.lineTo(x - 1, y - height - 5 - Math.random() * 8);
        ctx.lineTo(x + 1, y - height + 3);
        ctx.lineTo(x + 3, y - height - 3 - Math.random() * 5);
        ctx.lineTo(x + 4, y + 5);
        ctx.closePath();
        ctx.fill();
        
        // Lighter side
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK_LIGHT;
        ctx.fillRect(x - 1, y - height + 5, 2, height - 3);
        
        // Broken branch stubs
        if (Math.random() < 0.6) {
            ctx.fillStyle = CONFIG.COLORS.TREE_DEAD;
            ctx.beginPath();
            ctx.moveTo(x + 3, y - height * 0.5);
            ctx.lineTo(x + 12 + Math.random() * 8, y - height * 0.5 - 5);
            ctx.lineTo(x + 10, y - height * 0.5 + 2);
            ctx.closePath();
            ctx.fill();
        }
    }
    
    addCraters(ctx, centerX, width) {
        // Dark WW1 shell craters - muddy and grim
        this.craterPositions = [];
        
        for (let i = 0; i < 60; i++) {
            const x = centerX + (Math.random() - 0.5) * width * 0.95;
            const y = Math.random() * CONFIG.MAP_HEIGHT;
            const radius = 8 + Math.random() * 22;
            const hasWater = Math.random() < 0.4;
            
            this.craterPositions.push({ x, y, radius, hasWater });
            this.drawCrater(ctx, x, y, radius, hasWater);
        }
        
        // Smaller impact marks
        for (let i = 0; i < 100; i++) {
            const x = centerX + (Math.random() - 0.5) * width;
            const y = Math.random() * CONFIG.MAP_HEIGHT;
            const radius = 2 + Math.random() * 5;
            
            ctx.fillStyle = CONFIG.COLORS.MUD_DARK;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawCrater(ctx, x, y, radius, hasWater) {
        const pixelSize = 3;
        
        // Crater rim - raised mud around edge
        for (let py = -radius - 6; py < radius + 6; py += pixelSize) {
            for (let px = -radius - 6; px < radius + 6; px += pixelSize) {
                const dist = Math.sqrt(px * px + py * py);
                if (dist < radius + 6 && dist > radius - 3) {
                    const dither = ((Math.floor(px / pixelSize) + Math.floor(py / pixelSize)) % 2);
                    ctx.fillStyle = dither === 0 ? CONFIG.COLORS.MUD_LIGHT : CONFIG.COLORS.MUD;
                    ctx.fillRect(x + px, y + py, pixelSize, pixelSize);
                }
            }
        }
        
        // Crater interior
        if (hasWater) {
            // Murky water-filled crater
            for (let py = -radius + 2; py < radius - 2; py += pixelSize) {
                for (let px = -radius + 2; px < radius - 2; px += pixelSize) {
                    const dist = Math.sqrt(px * px + py * py);
                    if (dist < radius - 2) {
                        const dither = ((Math.floor(px / pixelSize) + Math.floor(py / pixelSize)) % 2);
                        ctx.fillStyle = dither === 0 ? CONFIG.COLORS.WATER : CONFIG.COLORS.WATER_LIGHT;
                        ctx.fillRect(x + px, y + py, pixelSize, pixelSize);
                    }
                }
            }
            // Water highlight
            ctx.fillStyle = CONFIG.COLORS.WATER_LIGHT;
            ctx.fillRect(x - radius * 0.3, y - radius * 0.3, 4, 3);
        } else {
            // Dark muddy crater
            ctx.fillStyle = CONFIG.COLORS.MUD_DARK;
            ctx.beginPath();
            ctx.arc(x, y, radius - 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Even darker center
            ctx.fillStyle = '#1a1005';
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    addDebris(ctx, centerX, width) {
        this.debrisPositions = [];
        
        // Scattered debris - wooden planks, metal scraps, etc.
        for (let i = 0; i < 80; i++) {
            const x = centerX + (Math.random() - 0.5) * width * 0.9;
            const y = Math.random() * CONFIG.MAP_HEIGHT;
            const type = Math.floor(Math.random() * 4); // 0=plank, 1=metal, 2=sandbag, 3=wheel
            const angle = Math.random() * Math.PI * 2;
            
            this.debrisPositions.push({ x, y, type, angle });
            this.drawDebris(ctx, x, y, type, angle);
        }
    }
    
    drawDebris(ctx, x, y, type, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        
        switch (type) {
            case 0: // Wooden plank
                ctx.fillStyle = CONFIG.COLORS.DUCKBOARD;
                ctx.fillRect(-12, -2, 24, 4);
                ctx.fillStyle = CONFIG.COLORS.DEBRIS_DARK;
                ctx.fillRect(-10, -1, 1, 2);
                ctx.fillRect(8, -1, 1, 2);
                break;
                
            case 1: // Metal scrap
                ctx.fillStyle = CONFIG.COLORS.METAL;
                ctx.beginPath();
                ctx.moveTo(-5, -3);
                ctx.lineTo(6, -2);
                ctx.lineTo(4, 4);
                ctx.lineTo(-6, 2);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = CONFIG.COLORS.RUST;
                ctx.fillRect(-2, -1, 4, 3);
                break;
                
            case 2: // Sandbag
                ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
                ctx.beginPath();
                ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = CONFIG.COLORS.SANDBAG;
                ctx.beginPath();
                ctx.ellipse(-1, -1, 6, 3, 0, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 3: // Wagon wheel fragment
                ctx.strokeStyle = CONFIG.COLORS.DEBRIS;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, 10, 0, Math.PI * 0.7);
                ctx.stroke();
                ctx.fillStyle = CONFIG.COLORS.DEBRIS_DARK;
                ctx.fillRect(-2, -2, 4, 4);
                break;
        }
        
        ctx.restore();
    }
    
    addRuinedStructures(ctx, centerX, width) {
        // Add a few ruined wall sections
        for (let i = 0; i < 3; i++) {
            const x = centerX + (Math.random() - 0.5) * width * 0.6;
            const y = Math.random() * CONFIG.MAP_HEIGHT;
            this.drawRuinedWall(ctx, x, y);
        }
    }
    
    drawRuinedWall(ctx, x, y) {
        // Ruined brick wall section
        const height = 20 + Math.random() * 15;
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(x + 8, y + 5, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Wall base
        ctx.fillStyle = CONFIG.COLORS.DEBRIS;
        
        // Jagged wall shape
        ctx.beginPath();
        ctx.moveTo(x - 15, y + 5);
        ctx.lineTo(x - 15, y - height + 10);
        ctx.lineTo(x - 10, y - height + 5);
        ctx.lineTo(x - 5, y - height + 12);
        ctx.lineTo(x, y - height);
        ctx.lineTo(x + 5, y - height + 8);
        ctx.lineTo(x + 10, y - height + 3);
        ctx.lineTo(x + 15, y - height + 15);
        ctx.lineTo(x + 15, y + 5);
        ctx.closePath();
        ctx.fill();
        
        // Brick lines
        ctx.strokeStyle = CONFIG.COLORS.DEBRIS_DARK;
        ctx.lineWidth = 1;
        for (let row = 0; row < height / 5; row++) {
            const rowY = y + 5 - row * 5;
            const offset = row % 2 === 0 ? 0 : 7;
            for (let col = 0; col < 3; col++) {
                ctx.strokeRect(x - 14 + col * 10 + offset, rowY - 4, 9, 4);
            }
        }
    }
    
    drawTrainTracks(ctx) {
        // Player side tracks (left)
        this.drawTrackLine(ctx, 50, 0, 50, CONFIG.MAP_HEIGHT);
        
        // Enemy side tracks (right)
        this.drawTrackLine(ctx, CONFIG.MAP_WIDTH - 50, 0, CONFIG.MAP_WIDTH - 50, CONFIG.MAP_HEIGHT);
    }
    
    drawTrackLine(ctx, x1, y1, x2, y2) {
        // Gravel bed
        ctx.fillStyle = CONFIG.COLORS.DEBRIS;
        ctx.fillRect(x1 - 18, y1, 36, y2 - y1);
        
        // Rails - darker iron color
        ctx.strokeStyle = CONFIG.COLORS.METAL;
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.moveTo(x1 - 8, y1);
        ctx.lineTo(x2 - 8, y2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(x1 + 8, y1);
        ctx.lineTo(x2 + 8, y2);
        ctx.stroke();
        
        // Rail highlight
        ctx.strokeStyle = '#5a5a5a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1 - 7, y1);
        ctx.lineTo(x2 - 7, y2);
        ctx.stroke();
        
        // Ties
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
        
        const length = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
        const ties = Math.floor(length / 25);
        
        for (let i = 0; i < ties; i++) {
            const t = i / ties;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            
            ctx.fillRect(x - 14, y - 2, 28, 5);
            
            // Wood grain detail
            ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK_LIGHT;
            ctx.fillRect(x - 12, y - 1, 24, 1);
            ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
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
    
    // Add blood stain to terrain
    addBloodStain(x, y, size) {
        this.bloodStains.push({
            x, y, size,
            time: 0,
            maxTime: 30 // Fade after 30 seconds
        });
        
        // Limit number of blood stains
        if (this.bloodStains.length > 100) {
            this.bloodStains.shift();
        }
    }
    
    // Main render function
    render() {
        const ctx = this.ctx;
        this.time += 1/60;
        
        // Update Fog of War visibility
        this.updateFogOfWar();
        
        // Clear canvas with dark color
        ctx.fillStyle = '#0a0a05';
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
        
        // Draw blood stains on terrain
        this.renderBloodStains(ctx);
        
        // Draw game elements
        this.game.trenchSystem.render(ctx, this);    // Pass renderer for FoW checks
        this.game.buildingManager.render(ctx, this); // Pass renderer for FoW checks
        this.game.unitManager.render(ctx, this);     // Pass renderer for FoW checks
        this.game.trainSystem.render(ctx);
        
        // Draw effects
        this.renderEffects(ctx);
        
        // Draw Fog of War overlay
        this.renderFogOfWar(ctx);
        
        // Draw scout plane if active
        if (this.game.scoutFlyover && this.game.scoutFlyover.active) {
            this.renderScoutPlane(ctx);
        }
        
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
        
        // Add fog of war/atmosphere at edges
        this.renderAtmosphere(ctx);
        
        ctx.restore();
        
        // Draw minimap
        this.renderMinimap();
    }
    
    renderBloodStains(ctx) {
        for (let i = this.bloodStains.length - 1; i >= 0; i--) {
            const stain = this.bloodStains[i];
            stain.time += 1/60;
            
            // Remove old stains
            if (stain.time > stain.maxTime) {
                this.bloodStains.splice(i, 1);
                continue;
            }
            
            const fade = stain.time > stain.maxTime - 5 ? 
                (stain.maxTime - stain.time) / 5 : 1;
            
            ctx.globalAlpha = fade * 0.7;
            ctx.fillStyle = CONFIG.COLORS.BLOOD_POOL;
            ctx.beginPath();
            ctx.arc(stain.x, stain.y, stain.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
    
    renderAtmosphere(ctx) {
        // Light fog effect at map edges
        const fogGradient = ctx.createRadialGradient(
            CONFIG.MAP_WIDTH / 2, CONFIG.MAP_HEIGHT / 2, 200,
            CONFIG.MAP_WIDTH / 2, CONFIG.MAP_HEIGHT / 2, CONFIG.MAP_WIDTH * 0.6
        );
        fogGradient.addColorStop(0, 'rgba(60, 55, 45, 0)');
        fogGradient.addColorStop(0.7, 'rgba(60, 55, 45, 0)');
        fogGradient.addColorStop(1, 'rgba(40, 35, 25, 0.3)');
        
        ctx.fillStyle = fogGradient;
        ctx.fillRect(0, 0, CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);
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
                case 'tracer':
                    this.renderTracer(ctx, effect, progress);
                    break;
                case 'smoke':
                    this.renderSmoke(ctx, effect, progress);
                    break;
                case 'grenade':
                    this.renderGrenade(ctx, effect, progress);
                    break;
            }
        }
    }
    
    renderGrenade(ctx, effect, progress) {
        // Calculate grenade position (arc trajectory)
        const startX = effect.x;
        const startY = effect.y;
        const endX = effect.targetX;
        const endY = effect.targetY;
        
        // Linear interpolation for X/Y
        const currentX = startX + (endX - startX) * progress;
        const currentY = startY + (endY - startY) * progress;
        
        // Arc height (parabola) - peaks at 50% progress
        const arcHeight = 40; // Maximum height of arc
        const arcProgress = 4 * progress * (1 - progress); // Parabola: 0 at start/end, 1 at middle
        const currentArcY = currentY - arcHeight * arcProgress;
        
        ctx.save();
        
        // Grenade shadow on ground
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(currentX, currentY + 2, 4, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = 1;
        
        // Spinning grenade body
        const spin = progress * Math.PI * 6; // Spin during flight
        ctx.translate(currentX, currentArcY);
        ctx.rotate(spin);
        
        // Grenade body (stick grenade / potato masher style for WWI feel)
        // Handle
        ctx.fillStyle = '#4a3a20';
        ctx.fillRect(-2, -8, 4, 12);
        
        // Head (explosive part)
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(-4, -12, 8, 6);
        
        // Metal band
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(-4, -8, 8, 2);
        
        ctx.restore();
        
        // Trail effect (small sparks)
        if (progress > 0.1 && progress < 0.9) {
            ctx.fillStyle = CONFIG.COLORS.MUZZLE_FLASH;
            ctx.globalAlpha = 0.6;
            for (let i = 0; i < 3; i++) {
                const trailProgress = Math.max(0, progress - i * 0.03);
                const trailX = startX + (endX - startX) * trailProgress;
                const trailY = startY + (endY - startY) * trailProgress;
                const trailArc = 4 * trailProgress * (1 - trailProgress);
                const trailArcY = trailY - arcHeight * trailArc;
                ctx.fillRect(trailX - 1, trailArcY - 1, 2, 2);
            }
            ctx.globalAlpha = 1;
        }
    }
    
    renderExplosion(ctx, effect, progress) {
        // WWI style explosion - more debris and smoke
        const size = effect.size * (1 + progress * 2);
        const alpha = 1 - progress;
        
        // Screen shake effect (handled via CSS class on canvas)
        if (progress < 0.1 && effect.size > 30) {
            this.canvas.classList.add('screen-shake');
            setTimeout(() => this.canvas.classList.remove('screen-shake'), 400);
        }
        
        ctx.save();
        
        // Smoke cloud (rises up)
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = CONFIG.COLORS.EXPLOSION_SMOKE;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y - progress * 30, size * 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Secondary smoke
        ctx.fillStyle = '#2a2515';
        ctx.beginPath();
        ctx.arc(effect.x + size * 0.3, effect.y - progress * 20 - 10, size * 1.2, 0, Math.PI * 2);
        ctx.fill();
        
        // Fire core
        ctx.globalAlpha = alpha;
        const fireColors = [
            CONFIG.COLORS.MUZZLE_FLASH,
            CONFIG.COLORS.EXPLOSION,
            CONFIG.COLORS.EXPLOSION_DARK,
            CONFIG.COLORS.DEBRIS_DARK
        ];
        const colorIdx = Math.min(3, Math.floor(progress * 4));
        ctx.fillStyle = fireColors[colorIdx];
        
        // Pixelated fire
        const fireSize = size * (1 - progress * 0.5);
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + progress * 2;
            const dist = fireSize * (0.3 + Math.random() * 0.5);
            const px = effect.x + Math.cos(angle) * dist;
            const py = effect.y + Math.sin(angle) * dist - progress * 10;
            const blockSize = size * 0.2 * (1 - progress * 0.5);
            ctx.fillRect(px - blockSize/2, py - blockSize/2, blockSize, blockSize);
        }
        
        // Bright center flash (early)
        if (progress < 0.3) {
            ctx.globalAlpha = (1 - progress / 0.3);
            ctx.fillStyle = CONFIG.COLORS.MUZZLE_CORE;
            ctx.fillRect(effect.x - 4, effect.y - 4, 8, 8);
        }
        
        // Debris chunks flying out
        ctx.globalAlpha = alpha;
        const debrisCount = Math.floor(effect.size / 5);
        for (let i = 0; i < debrisCount; i++) {
            const angle = (i / debrisCount) * Math.PI * 2 + effect.x * 0.1;
            const dist = size * (0.5 + progress * 1.5);
            const px = effect.x + Math.cos(angle) * dist;
            const py = effect.y + Math.sin(angle) * dist - progress * 25 + progress * progress * 20;
            const debrisSize = 2 + Math.random() * 4;
            ctx.fillStyle = i % 2 === 0 ? CONFIG.COLORS.DEBRIS : CONFIG.COLORS.MUD;
            ctx.fillRect(px, py, debrisSize, debrisSize);
        }
        
        ctx.restore();
    }
    
    renderMuzzleFlash(ctx, effect, progress) {
        // Quick bright muzzle flash - Cannon Fodder style
        const size = effect.size * (1 - progress * 0.7);
        const alpha = 1 - progress;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // White hot core
        if (progress < 0.5) {
            ctx.fillStyle = CONFIG.COLORS.MUZZLE_CORE;
            ctx.fillRect(effect.x - size * 0.3, effect.y - size * 0.3, size * 0.6, size * 0.6);
        }
        
        // Yellow/orange flash
        ctx.fillStyle = CONFIG.COLORS.MUZZLE_FLASH;
        ctx.fillRect(effect.x - size/2, effect.y - size/2, size, size);
        
        // Flash spikes
        ctx.fillStyle = CONFIG.COLORS.EXPLOSION;
        const spikeLength = size * 0.8;
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            ctx.fillRect(
                effect.x + Math.cos(angle) * spikeLength - 1,
                effect.y + Math.sin(angle) * spikeLength - 1,
                3, 3
            );
        }
        
        ctx.restore();
    }
    
    renderTracer(ctx, effect, progress) {
        // Bullet tracer line
        const alpha = 1 - progress;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = CONFIG.COLORS.TRACER;
        ctx.lineWidth = 2;
        
        const length = 15 * (1 - progress);
        const angle = effect.angle || 0;
        
        ctx.beginPath();
        ctx.moveTo(effect.x, effect.y);
        ctx.lineTo(
            effect.x - Math.cos(angle) * length,
            effect.y - Math.sin(angle) * length
        );
        ctx.stroke();
        
        // Bright tip
        ctx.fillStyle = CONFIG.COLORS.MUZZLE_CORE;
        ctx.fillRect(effect.x - 1, effect.y - 1, 2, 2);
        
        ctx.restore();
    }
    
    renderSmoke(ctx, effect, progress) {
        const alpha = (1 - progress) * 0.5;
        const size = effect.size * (1 + progress * 2);
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = CONFIG.COLORS.EXPLOSION_SMOKE;
        
        // Multiple smoke puffs
        for (let i = 0; i < 3; i++) {
            const offsetX = Math.sin(progress * 3 + i) * 10;
            const offsetY = -progress * 40 - i * 10;
            ctx.beginPath();
            ctx.arc(effect.x + offsetX, effect.y + offsetY, size * (0.6 + i * 0.2), 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    renderDirtPuff(ctx, effect, progress) {
        // Dark dirt particles flying up
        const alpha = (1 - progress) * 0.8;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // Multiple dirt chunks
        for (let i = 0; i < 6; i++) {
            const offsetX = (i - 2.5) * 6 + Math.sin(i + progress * 10) * 3;
            const offsetY = -progress * 25 - i * 5 + progress * progress * 15;
            const size = (5 - progress * 4) * (0.8 + Math.random() * 0.4);
            ctx.fillStyle = i % 2 === 0 ? CONFIG.COLORS.MUD : CONFIG.COLORS.MUD_DARK;
            ctx.fillRect(effect.x + offsetX - size/2, effect.y + offsetY - size/2, size, size);
        }
        
        ctx.restore();
    }
    
    renderBlood(ctx, effect, progress) {
        // Dark blood splatter - Cannon Fodder style
        const alpha = 1 - progress * 0.3;
        const size = effect.size;
        
        ctx.save();
        
        // Main blood pool (stays on ground)
        if (progress > 0.5) {
            // Add persistent stain
            if (progress > 0.5 && progress < 0.55) {
                this.addBloodStain(effect.x, effect.y, size * 0.8);
            }
        }
        
        ctx.globalAlpha = alpha;
        
        // Splatter droplets
        ctx.fillStyle = CONFIG.COLORS.BLOOD;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + effect.x * 0.1;
            const dist = size * (0.4 + progress * 0.6);
            const px = effect.x + Math.cos(angle) * dist;
            const py = effect.y + Math.sin(angle) * dist;
            const dropSize = 2 + Math.random() * 3;
            ctx.fillRect(px - dropSize/2, py - dropSize/2, dropSize, dropSize);
        }
        
        // Central pool
        ctx.fillStyle = CONFIG.COLORS.BLOOD_BRIGHT;
        ctx.fillRect(effect.x - size/2, effect.y - size/2, size, size);
        
        ctx.restore();
    }
    
    renderSelectionBox(ctx) {
        const input = this.game.input;
        const x1 = Math.min(input.selectionStart.x, input.selectionEnd.x);
        const y1 = Math.min(input.selectionStart.y, input.selectionEnd.y);
        const x2 = Math.max(input.selectionStart.x, input.selectionEnd.x);
        const y2 = Math.max(input.selectionStart.y, input.selectionEnd.y);
        
        // Cannon Fodder style selection - yellow dashed
        ctx.strokeStyle = CONFIG.COLORS.SELECTION;
        ctx.lineWidth = 2 / this.camera.zoom;
        ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'rgba(255, 220, 50, 0.1)';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    
    renderTrenchPreview(ctx) {
        const points = this.game.input.trenchPoints;
        if (points.length < 2) return;
        
        ctx.strokeStyle = 'rgba(138, 122, 90, 0.6)';
        ctx.lineWidth = 22;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([12, 8]);
        
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
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([6, 6]);
        
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
        
        ctx.save();
        ctx.globalAlpha = 0.6;
        
        if (canPlace) {
            ctx.strokeStyle = '#44ff44';
            ctx.fillStyle = 'rgba(50, 255, 50, 0.2)';
        } else {
            ctx.strokeStyle = '#ff4444';
            ctx.fillStyle = 'rgba(255, 50, 50, 0.2)';
        }
        
        ctx.lineWidth = 3;
        
        switch (preview.type) {
            case 'machinegun':
                ctx.beginPath();
                ctx.arc(preview.x, preview.y, 25, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                if (canPlace) {
                    ctx.globalAlpha = 0.1;
                    ctx.beginPath();
                    ctx.arc(preview.x, preview.y, CONFIG.MG_RANGE, 0, Math.PI * 2);
                    ctx.stroke();
                }
                break;
            case 'artillery':
                ctx.beginPath();
                ctx.arc(preview.x, preview.y, 35, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                if (canPlace) {
                    ctx.globalAlpha = 0.1;
                    ctx.beginPath();
                    ctx.arc(preview.x, preview.y, CONFIG.ARTILLERY_RANGE, 0, Math.PI * 2);
                    ctx.stroke();
                }
                break;
            case 'barbed':
                ctx.strokeRect(preview.x - 30, preview.y - 10, 60, 20);
                break;
            case 'medical_tent':
                ctx.beginPath();
                ctx.arc(preview.x, preview.y, 30, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                if (canPlace) {
                    ctx.globalAlpha = 0.15;
                    ctx.strokeStyle = '#44ff44';
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.arc(preview.x, preview.y, CONFIG.MEDICAL_TENT_HEAL_RANGE, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                break;
            case 'bunker':
                ctx.beginPath();
                ctx.arc(preview.x, preview.y, 35, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                if (canPlace) {
                    ctx.globalAlpha = 0.1;
                    ctx.beginPath();
                    ctx.arc(preview.x, preview.y, CONFIG.RIFLE_RANGE, 0, Math.PI * 2);
                    ctx.stroke();
                }
                break;
            case 'observation_post':
                ctx.beginPath();
                ctx.arc(preview.x, preview.y, 20, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                if (canPlace) {
                    ctx.globalAlpha = 0.08;
                    ctx.strokeStyle = '#4488ff';
                    ctx.setLineDash([8, 8]);
                    ctx.beginPath();
                    ctx.arc(preview.x, preview.y, CONFIG.VISION_OBSERVATION_POST, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                break;
            case 'supply_depot':
                ctx.beginPath();
                ctx.arc(preview.x, preview.y, 35, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                break;
            case 'mortar':
                ctx.beginPath();
                ctx.arc(preview.x, preview.y, 25, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                if (canPlace) {
                    ctx.globalAlpha = 0.1;
                    ctx.beginPath();
                    ctx.arc(preview.x, preview.y, CONFIG.MORTAR_RANGE, 0, Math.PI * 2);
                    ctx.stroke();
                }
                break;
        }
        
        ctx.restore();
    }
    
    renderScoutPlane(ctx) {
        const scout = this.game.scoutFlyover;
        const x = scout.planeX;
        const y = scout.planeY;
        
        ctx.save();
        ctx.translate(x, y);
        
        // Slight banking animation
        const bankAngle = Math.sin(this.time * 2) * 0.05;
        ctx.rotate(bankAngle);
        
        // Shadow on ground (offset based on height)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(30, 150, 25, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // WWI Biplane style scout aircraft
        // Fuselage
        ctx.fillStyle = '#5a5040';
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(40, -3);
        ctx.lineTo(45, 0);
        ctx.lineTo(40, 3);
        ctx.lineTo(-30, 0);
        ctx.fill();
        
        // Fuselage stripes (military markings)
        ctx.fillStyle = '#4a6040';
        ctx.fillRect(-20, -2, 15, 4);
        
        // Upper wing
        ctx.fillStyle = '#6a6050';
        ctx.fillRect(-20, -15, 50, 8);
        
        // Lower wing
        ctx.fillRect(-15, 5, 45, 7);
        
        // Wing struts
        ctx.strokeStyle = '#4a4030';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-15, -7);
        ctx.lineTo(-10, 5);
        ctx.moveTo(20, -7);
        ctx.lineTo(25, 5);
        ctx.stroke();
        
        // Tail
        ctx.fillStyle = '#5a5040';
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-45, -8);
        ctx.lineTo(-45, 8);
        ctx.closePath();
        ctx.fill();
        
        // Vertical stabilizer
        ctx.fillRect(-42, -12, 8, 4);
        
        // Propeller blur
        ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
        ctx.beginPath();
        ctx.ellipse(48, 0, 3, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Cockpit
        ctx.fillStyle = '#3a3020';
        ctx.fillRect(5, -4, 12, 8);
        ctx.fillStyle = '#2a4a5a';
        ctx.fillRect(7, -2, 8, 4);
        
        // Roundel (friendly marking)
        ctx.fillStyle = '#2a4a2a';
        ctx.beginPath();
        ctx.arc(0, -11, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a3030';
        ctx.beginPath();
        ctx.arc(0, -11, 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Engine exhaust smoke
        ctx.fillStyle = 'rgba(80, 70, 60, 0.4)';
        for (let i = 0; i < 5; i++) {
            const smokeX = -50 - i * 15 - Math.random() * 10;
            const smokeY = Math.sin(this.time * 5 + i) * 5;
            const smokeSize = 8 + i * 3;
            ctx.beginPath();
            ctx.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
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
        mctx.fillStyle = '#2a3a1a';
        mctx.fillRect(0, 0, mw, mh);
        
        // No man's land (darker brown strip)
        mctx.fillStyle = '#2a1a0a';
        mctx.fillRect(mw * 0.38, 0, mw * 0.24, mh);
        
        // Trenches (khaki lines)
        mctx.strokeStyle = CONFIG.COLORS.SANDBAG;
        mctx.lineWidth = 2;
        mctx.lineCap = 'round';
        for (const trench of this.game.trenchSystem.trenches) {
            if (trench.points.length < 2) continue;
            mctx.globalAlpha = trench.isBlueprint ? 0.4 : 1;
            mctx.beginPath();
            mctx.moveTo(trench.points[0].x * sx, trench.points[0].y * sy);
            for (let i = 1; i < trench.points.length; i++) {
                mctx.lineTo(trench.points[i].x * sx, trench.points[i].y * sy);
            }
            mctx.stroke();
        }
        mctx.globalAlpha = 1;
        
        // Units as dots
        for (const unit of this.game.unitManager.units) {
            if (unit.state === 'dead') continue;
            mctx.fillStyle = unit.team === CONFIG.TEAM_PLAYER ? '#6a9a4a' : '#9a5a3a';
            mctx.fillRect(unit.x * sx - 1, unit.y * sy - 1, 3, 3);
        }
        
        // Buildings
        for (const building of this.game.buildingManager.buildings) {
            if (building.destroyed) continue;
            mctx.fillStyle = building.team === CONFIG.TEAM_PLAYER ? '#5a8a3a' : '#8a4a2a';
            if (building.type === 'hq') {
                mctx.fillRect(building.x * sx - 4, building.y * sy - 4, 8, 8);
            } else {
                mctx.fillRect(building.x * sx - 2, building.y * sy - 2, 4, 4);
            }
        }
        
        // Camera viewport
        const viewLeft = (this.camera.x - this.viewWidth / 2 / this.camera.zoom) * sx;
        const viewTop = (this.camera.y - this.viewHeight / 2 / this.camera.zoom) * sy;
        const viewW = (this.viewWidth / this.camera.zoom) * sx;
        const viewH = (this.viewHeight / this.camera.zoom) * sy;
        
        mctx.strokeStyle = CONFIG.COLORS.SELECTION;
        mctx.lineWidth = 1;
        mctx.strokeRect(viewLeft, viewTop, viewW, viewH);
    }
}
