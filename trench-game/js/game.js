// Main Game Module - Entry point and game loop
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { TrenchSystem } from './trench.js';
import { UnitManager } from './units.js';
import { BuildingManager } from './buildings.js';
import { TrainSystem } from './trains.js';
import { CombatSystem } from './combat.js';
import { AIController } from './ai.js';
import { UI } from './ui.js';

// Game configuration
export const CONFIG = {
    // Map size in world units
    MAP_WIDTH: 2000,
    MAP_HEIGHT: 1200,
    
    // Grid size for pathfinding
    GRID_SIZE: 20,
    
    // Teams
    TEAM_PLAYER: 0,
    TEAM_ENEMY: 1,
    
    // Starting resources
    STARTING_MANPOWER: 20,
    STARTING_SUPPLIES: 100,
    STARTING_SHELLS: 20,
    MAX_SHELLS: 100,
    
    // Train settings
    TRAIN_INTERVAL: 30000, // 30 seconds
    SOLDIERS_PER_TRAIN: 8,
    WORKERS_PER_TRAIN: 2,
    
    // Combat settings
    RIFLE_RANGE: 200,
    MG_RANGE: 350,
    ARTILLERY_RANGE: 1800, // Artillery can shoot across the entire map
    
    // Build costs
    COST_TRENCH_PER_UNIT: 1,
    COST_MACHINEGUN: 25,
    COST_ARTILLERY: 50,
    COST_BARBED_WIRE: 10,
    COST_MEDICAL_TENT: 30,
    COST_BUNKER: 40,
    COST_OBSERVATION_POST: 20,
    COST_SUPPLY_DEPOT: 35,
    COST_MORTAR: 30,
    
    // Vision ranges (for Fog of War)
    VISION_SOLDIER: 150,
    VISION_WORKER: 100,
    VISION_BUILDING: 200,
    VISION_HQ: 300,
    VISION_OBSERVATION_POST: 400,
    
    // Medical Tent
    MEDICAL_TENT_HEAL_RANGE: 250,
    MEDICAL_TENT_HEAL_RATE: 5,
    
    // Bunker
    BUNKER_CAPACITY: 4,
    BUNKER_PROTECTION: 0.8,
    
    // Supply Depot
    SUPPLY_DEPOT_SHELL_BONUS: 50,
    SUPPLY_DEPOT_REGEN_BONUS: 0.5,
    
    // Mortar
    MORTAR_RANGE: 600,
    MORTAR_DAMAGE: 40,
    MORTAR_SPLASH: 35,
    MORTAR_FIRE_RATE: 0.5,
    MORTAR_SHELL_COST: 0.25,
    
    // Colors - WWI Cannon Fodder style palette
    COLORS: {
        // Terrain
        GRASS_1: '#5b6b2a',        // Dark olive drab base
        GRASS_2: '#6a7a3a',        // Medium olive
        GRASS_3: '#4a5a1a',        // Darker olive
        GRASS_4: '#7a8a4a',        // Yellow-green highlight
        GRASS_DEAD: '#5a5030',     // Dead grass patches
        MUD: '#4a3a20',            // Dark brown mud
        MUD_DARK: '#2a1a0a',       // Very dark mud (craters)
        MUD_LIGHT: '#6a5a3a',      // Lighter mud
        MUD_WET: '#3a2a15',        // Wet mud
        WATER: '#1a2a35',          // Dark murky water
        WATER_LIGHT: '#2a3a45',    // Murky water highlight
        
        // Structures
        SANDBAG: '#8a7a5a',        // Khaki sandbags
        SANDBAG_DARK: '#6a5a3a',   // Shaded sandbags
        TRENCH: '#1a1a0a',         // Dark trench interior
        TRENCH_WALL: '#3a3020',    // Trench walls
        DUCKBOARD: '#4a3a20',      // Wooden planks
        
        // Units - Player (British style)
        PLAYER_BODY: '#4a6030',    // Khaki uniform
        PLAYER_BODY_DARK: '#3a5020', // Darker uniform
        PLAYER_SKIN: '#d8a070',    // Skin tone
        PLAYER_HELMET: '#4a5a3a',  // Brodie helmet
        PLAYER_WEBBING: '#5a5030', // Equipment
        
        // Units - Enemy (German style)
        ENEMY_BODY: '#5a5a4a',     // Field grey uniform
        ENEMY_BODY_DARK: '#4a4a3a',
        ENEMY_SKIN: '#d8a070',     // Skin tone
        ENEMY_HELMET: '#4a4a40',   // Stahlhelm grey
        
        // Selection & UI
        SELECTION: '#ffdd44',      // Cannon Fodder yellow arrow
        SELECTION_GLOW: '#ffaa00', // Arrow glow
        
        // Combat effects
        BLOOD: '#6a0000',          // Dark blood
        BLOOD_BRIGHT: '#8a1010',   // Fresh blood
        BLOOD_POOL: '#3a0000',     // Dried blood
        MUZZLE_FLASH: '#ffcc44',   // Bright yellow flash
        MUZZLE_CORE: '#ffffff',    // White hot center
        EXPLOSION: '#ff6622',      // Fire orange
        EXPLOSION_DARK: '#aa3300', // Dark fire
        EXPLOSION_SMOKE: '#3a3020',// Smoke
        TRACER: '#ffee88',         // Bullet tracer
        
        // Environment
        BARBED_WIRE: '#3a3a3a',
        BARBED_WIRE_RUST: '#5a4a3a',
        SHADOW: '#0a0a05',
        FOG: 'rgba(60, 55, 45, 0.15)',
        
        // Trees & vegetation
        TREE_TRUNK: '#2a1a0a',
        TREE_TRUNK_LIGHT: '#3a2a15',
        TREE_DEAD: '#3a3020',      // Dead tree
        TREE_LEAVES: '#4a4020',    // Brown autumn leaves
        TREE_LEAVES_LIGHT: '#5a5030',
        
        // Debris & details
        DEBRIS: '#3a3020',
        DEBRIS_DARK: '#2a2010',
        RUST: '#5a3a20',
        METAL: '#4a4a4a'
    }
};

// Game state
export const GameState = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameover'
};

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.state = GameState.MENU;
        this.lastTime = 0;
        this.deltaTime = 0;
        
        // Resources
        this.resources = {
            manpower: CONFIG.STARTING_MANPOWER,
            supplies: CONFIG.STARTING_SUPPLIES,
            shells: CONFIG.STARTING_SHELLS
        };
        
        // Initialize systems
        this.renderer = new Renderer(this);
        this.input = new Input(this);
        this.trenchSystem = new TrenchSystem(this);
        this.unitManager = new UnitManager(this);
        this.buildingManager = new BuildingManager(this);
        this.trainSystem = new TrainSystem(this);
        this.combatSystem = new CombatSystem(this);
        this.ai = new AIController(this);
        this.ui = new UI(this);
        
        // Current tool
        this.currentTool = 'select';
        
        // Selection
        this.selectedUnits = [];
        
        // Effects (explosions, muzzle flashes, etc.)
        this.effects = [];
        
        // Scout Flyover system
        this.scoutFlyover = {
            active: false,
            cooldown: 0,           // Time until can use again
            duration: 0,           // Time remaining on current flyover
            maxCooldown: 60,       // 60 second cooldown
            maxDuration: 8,        // 8 seconds of revealed map
            cost: 30,              // Supply cost
            planeX: 0,             // Plane visual position
            planeY: 0
        };
        
        // Bind methods
        this.gameLoop = this.gameLoop.bind(this);
        this.resize = this.resize.bind(this);
        
        // Setup
        this.resize();
        window.addEventListener('resize', this.resize);
        
        // Start loop
        requestAnimationFrame(this.gameLoop);
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.renderer.updateViewport();
    }
    
    startGame() {
        this.state = GameState.PLAYING;
        
        // Reset resources
        this.resources.manpower = CONFIG.STARTING_MANPOWER;
        this.resources.supplies = CONFIG.STARTING_SUPPLIES;
        this.resources.shells = CONFIG.STARTING_SHELLS;
        
        // Clear everything
        this.trenchSystem.clear();
        this.unitManager.clear();
        this.buildingManager.clear();
        this.effects = [];
        this.selectedUnits = [];
        
        // Spawn initial units for player
        this.spawnInitialUnits(CONFIG.TEAM_PLAYER);
        
        // Spawn initial units for enemy
        this.spawnInitialUnits(CONFIG.TEAM_ENEMY);
        
        // Setup AI initial trenches
        this.ai.initialize();
        
        // Start train system
        this.trainSystem.start();
        
        // Update UI
        this.ui.showHUD();
    }
    
    spawnInitialUnits(team) {
        const isPlayer = team === CONFIG.TEAM_PLAYER;
        const baseX = isPlayer ? 150 : CONFIG.MAP_WIDTH - 150;
        const centerY = CONFIG.MAP_HEIGHT / 2;
        
        // Spawn workers
        for (let i = 0; i < 5; i++) {
            const x = baseX + (Math.random() - 0.5) * 100;
            const y = centerY + (i - 2) * 60;
            this.unitManager.spawnUnit('worker', x, y, team);
        }
        
        // Spawn soldiers
        for (let i = 0; i < 10; i++) {
            const x = baseX + 50 + (Math.random() - 0.5) * 80;
            const y = centerY + (i - 5) * 50;
            this.unitManager.spawnUnit('soldier', x, y, team);
        }
    }
    
    gameLoop(currentTime) {
        // Calculate delta time
        this.deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        // Cap delta time to prevent huge jumps
        if (this.deltaTime > 0.1) this.deltaTime = 0.1;
        
        // Update
        if (this.state === GameState.PLAYING) {
            this.update();
        }
        
        // Render
        this.render();
        
        // Continue loop
        requestAnimationFrame(this.gameLoop);
    }
    
    update() {
        // Update all systems
        this.input.update();
        this.unitManager.update(this.deltaTime);
        this.buildingManager.update(this.deltaTime);
        this.trainSystem.update(this.deltaTime);
        this.combatSystem.update(this.deltaTime);
        this.ai.update(this.deltaTime);
        
        // Update effects
        this.updateEffects(this.deltaTime);
        
        // Update scout flyover
        this.updateScoutFlyover(this.deltaTime);
        
        // Check win/lose conditions
        this.checkGameOver();
        
        // Update UI
        this.ui.update();
    }
    
    updateScoutFlyover(dt) {
        // Update cooldown
        if (this.scoutFlyover.cooldown > 0) {
            this.scoutFlyover.cooldown -= dt;
        }
        
        // Update active flyover
        if (this.scoutFlyover.active) {
            this.scoutFlyover.duration -= dt;
            
            // Animate plane across map (left to right)
            const progress = 1 - (this.scoutFlyover.duration / this.scoutFlyover.maxDuration);
            this.scoutFlyover.planeX = -100 + (CONFIG.MAP_WIDTH + 200) * progress;
            this.scoutFlyover.planeY = CONFIG.MAP_HEIGHT * 0.3 + Math.sin(progress * Math.PI * 2) * 50;
            
            if (this.scoutFlyover.duration <= 0) {
                this.scoutFlyover.active = false;
                this.scoutFlyover.cooldown = this.scoutFlyover.maxCooldown;
            }
        }
    }
    
    // Start a scout flyover - reveals the entire map temporarily
    startScoutFlyover() {
        if (this.scoutFlyover.active) return false;
        if (this.scoutFlyover.cooldown > 0) return false;
        if (!this.canAfford(this.scoutFlyover.cost)) return false;
        
        this.spendSupplies(this.scoutFlyover.cost);
        this.scoutFlyover.active = true;
        this.scoutFlyover.duration = this.scoutFlyover.maxDuration;
        this.scoutFlyover.planeX = -100;
        this.scoutFlyover.planeY = CONFIG.MAP_HEIGHT * 0.3;
        
        return true;
    }
    
    canStartScoutFlyover() {
        return !this.scoutFlyover.active && 
               this.scoutFlyover.cooldown <= 0 && 
               this.canAfford(this.scoutFlyover.cost);
    }
    
    updateEffects(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.time += dt;
            
            if (effect.time >= effect.duration) {
                // Handle grenade explosion when grenade effect completes
                if (effect.type === 'grenade') {
                    this.grenadeExplosion(effect);
                }
                
                this.effects.splice(i, 1);
            }
        }
    }
    
    // Handle grenade explosion - damages buildings and units in area
    grenadeExplosion(effect) {
        const x = effect.targetX;
        const y = effect.targetY;
        const damage = effect.damage || 100;
        const splashRadius = effect.splashRadius || 40;
        
        // Add explosion visual effect
        this.addEffect('explosion', x, y, {
            size: 30,
            duration: 0.5
        });
        
        // Damage buildings in splash radius (grenades are very effective vs buildings)
        for (const building of this.buildingManager.buildings) {
            if (building.destroyed || building.isBlueprint) continue;
            if (building.type === 'hq') continue; // HQ is too big for grenades
            
            const dist = Math.sqrt((building.x - x) ** 2 + (building.y - y) ** 2);
            if (dist < splashRadius + building.radius) {
                // Grenades deal full damage to buildings (they're meant for this!)
                const falloff = Math.max(0.5, 1 - (dist / (splashRadius + building.radius)));
                this.buildingManager.takeDamage(building, damage * falloff);
            }
        }
        
        // Damage units in splash radius (less damage than to buildings)
        const allUnits = this.unitManager.units;
        for (const unit of allUnits) {
            if (unit.state === 'dead') continue;
            
            const dist = Math.sqrt((unit.x - x) ** 2 + (unit.y - y) ** 2);
            if (dist < splashRadius) {
                const falloff = 1 - (dist / splashRadius);
                // Grenades deal 25% damage to units compared to buildings (less effective vs infantry)
                this.combatSystem.dealDamage(unit, damage * falloff * 0.25, effect.source);
                unit.suppression = 100; // Full suppression
            }
        }
        
        // Damage trenches (minor)
        this.trenchSystem.damageTrenchesAtPoint(x, y, splashRadius, damage * 0.2);
    }
    
    addEffect(type, x, y, options = {}) {
        this.effects.push({
            type,
            x,
            y,
            time: 0,
            duration: options.duration || 0.5,
            size: options.size || 20,
            ...options
        });
    }
    
    render() {
        this.renderer.render();
    }
    
    checkGameOver() {
        // Check if player HQ is destroyed
        const playerHQ = this.buildingManager.getHQ(CONFIG.TEAM_PLAYER);
        const enemyHQ = this.buildingManager.getHQ(CONFIG.TEAM_ENEMY);
        
        if (playerHQ && playerHQ.destroyed) {
            this.endGame(false);
        } else if (enemyHQ && enemyHQ.destroyed) {
            this.endGame(true);
        }
    }
    
    endGame(victory) {
        this.state = GameState.GAME_OVER;
        this.ui.showGameOver(victory);
    }
    
    // Resource management
    canAfford(cost) {
        return this.resources.supplies >= cost;
    }
    
    spendSupplies(amount) {
        if (this.canAfford(amount)) {
            this.resources.supplies -= amount;
            return true;
        }
        return false;
    }
    
    addManpower(amount) {
        this.resources.manpower += amount;
    }
    
    // Tool management
    setTool(tool) {
        this.currentTool = tool;
        this.ui.updateToolbar(tool);
        
        // Update cursor
        this.canvas.className = '';
        switch (tool) {
            case 'select':
                this.canvas.classList.add('cursor-select');
                break;
            case 'trench':
                this.canvas.classList.add('cursor-trench');
                break;
            case 'machinegun':
            case 'artillery':
            case 'barbed':
                this.canvas.classList.add('cursor-build');
                break;
        }
    }
    
    // Selection management
    selectUnits(units) {
        // Deselect previous
        this.selectedUnits.forEach(u => u.selected = false);
        
        // Select new
        this.selectedUnits = units.filter(u => u.team === CONFIG.TEAM_PLAYER);
        this.selectedUnits.forEach(u => u.selected = true);
        
        this.ui.updateSelection(this.selectedUnits);
    }
    
    clearSelection() {
        this.selectedUnits.forEach(u => u.selected = false);
        this.selectedUnits = [];
        this.ui.updateSelection([]);
    }
    
    // Commands
    orderCharge() {
        const soldiers = this.selectedUnits.filter(u => u.type === 'soldier');
        soldiers.forEach(soldier => {
            soldier.setState('charging');
        });
    }
    
    orderRetreat() {
        // Find unmanned stations that need soldiers
        const unmannedStations = this.buildingManager.buildings.filter(b =>
            b.team === CONFIG.TEAM_PLAYER &&
            !b.destroyed &&
            !b.isBlueprint &&
            b.needsManning &&
            !b.mannedBy &&
            ['machinegun', 'artillery', 'observation_post', 'mortar'].includes(b.type)
        );
        
        // Find bunkers with space
        const availableBunkers = this.buildingManager.buildings.filter(b =>
            b.team === CONFIG.TEAM_PLAYER &&
            !b.destroyed &&
            !b.isBlueprint &&
            b.type === 'bunker' &&
            b.occupants.length < b.capacity
        );
        
        // Find all player trenches and sort by x position
        const playerTrenches = this.trenchSystem.trenches.filter(t => 
            t.team === CONFIG.TEAM_PLAYER && !t.isBlueprint
        );
        
        // Get trench positions sorted by x (forward to back)
        const trenchPositions = playerTrenches.map(trench => {
            const avgX = trench.points.reduce((sum, p) => sum + p.x, 0) / trench.points.length;
            const avgY = trench.points.reduce((sum, p) => sum + p.y, 0) / trench.points.length;
            return { trench, avgX, avgY };
        });
        trenchPositions.sort((a, b) => b.avgX - a.avgX);
        
        const forwardTrench = trenchPositions[0]; // Rightmost = forward
        const backTrench = trenchPositions[trenchPositions.length - 1]; // Leftmost = back
        
        // Track which stations/bunkers have been assigned
        const assignedStations = new Set();
        const bunkerAssignments = new Map(); // bunker -> count assigned
        
        this.selectedUnits.forEach((unit, index) => {
            if (unit.type === 'soldier') {
                // Priority 1: Man unmanned stations
                let assigned = false;
                
                for (const station of unmannedStations) {
                    if (!assignedStations.has(station.id)) {
                        assignedStations.add(station.id);
                        unit.moveTo(station.x, station.y);
                        unit.setState('retreating');
                        assigned = true;
                        break;
                    }
                }
                
                if (assigned) return;
                
                // Priority 2: Fill bunkers
                for (const bunker of availableBunkers) {
                    const currentAssigned = bunkerAssignments.get(bunker.id) || 0;
                    const spotsLeft = bunker.capacity - bunker.occupants.length - currentAssigned;
                    if (spotsLeft > 0) {
                        bunkerAssignments.set(bunker.id, currentAssigned + 1);
                        unit.moveTo(bunker.x, bunker.y);
                        unit.setState('retreating');
                        unit.seekingBunker = bunker;
                        assigned = true;
                        break;
                    }
                }
                
                if (assigned) return;
                
                // Priority 3: Go to forward trench
                if (forwardTrench) {
                    const spread = (index % 5 - 2) * 20;
                    unit.moveTo(forwardTrench.avgX, forwardTrench.avgY + spread);
                } else {
                    // No trenches - move toward front line
                    unit.moveTo(CONFIG.MAP_WIDTH * 0.3, unit.y);
                }
                unit.setState('retreating');
                
            } else {
                // Workers go to back-most trench for safety
                if (backTrench) {
                    const spread = (index % 5 - 2) * 20;
                    unit.moveTo(backTrench.avgX, backTrench.avgY + spread);
                } else {
                    // No trenches - retreat toward HQ
                    unit.moveTo(100, unit.y);
                }
                unit.setState('retreating');
            }
        });
    }
    
    // Utility
    getDistance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

// Start the game when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});

