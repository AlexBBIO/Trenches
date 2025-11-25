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
    
    // Train settings
    TRAIN_INTERVAL: 30000, // 30 seconds
    SOLDIERS_PER_TRAIN: 8,
    WORKERS_PER_TRAIN: 2,
    
    // Combat settings
    RIFLE_RANGE: 200,
    MG_RANGE: 350,
    ARTILLERY_RANGE: 600,
    
    // Build costs
    COST_TRENCH_PER_UNIT: 1,
    COST_MACHINEGUN: 25,
    COST_ARTILLERY: 50,
    COST_BARBED_WIRE: 10,
    
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
            supplies: CONFIG.STARTING_SUPPLIES
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
        
        // Check win/lose conditions
        this.checkGameOver();
        
        // Update UI
        this.ui.update();
    }
    
    updateEffects(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.time += dt;
            
            if (effect.time >= effect.duration) {
                this.effects.splice(i, 1);
            }
        }
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
        this.selectedUnits.forEach(unit => {
            const nearestTrench = this.trenchSystem.findNearestTrench(unit.x, unit.y, CONFIG.TEAM_PLAYER);
            if (nearestTrench) {
                unit.moveTo(nearestTrench.x, nearestTrench.y);
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

