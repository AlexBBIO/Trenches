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
    
    // Colors - Dark WW1 Cannon Fodder style
    COLORS: {
        GRASS_1: '#6b7b3a',        // Olive drab base
        GRASS_2: '#7a8b4a',        // Lighter olive
        GRASS_3: '#5a6b2a',        // Darker olive
        GRASS_4: '#8b9b5a',        // Yellow-green highlight
        MUD: '#5a4a2a',            // Dark brown mud
        MUD_DARK: '#3a2a1a',       // Very dark mud
        MUD_LIGHT: '#7a6a4a',      // Lighter mud
        WATER: '#2a3a4a',          // Dark murky water
        SANDBAG: '#8a7a5a',        // Khaki sandbags
        TRENCH: '#2a2a1a',         // Dark trench interior
        PLAYER_BODY: '#4a6a3a',    // Olive drab uniform
        PLAYER_SKIN: '#daa870',    // Skin tone
        ENEMY_BODY: '#6a5a4a',     // Grey-brown enemy
        ENEMY_SKIN: '#daa870',     // Skin tone  
        SELECTION: '#ffff88',      // Yellow selection arrow
        BLOOD: '#8a0000',          // Dark blood
        MUZZLE_FLASH: '#ffaa44',   // Orange flash
        EXPLOSION: '#ff6622',      // Fire orange
        BARBED_WIRE: '#4a4a4a',
        SHADOW: '#1a1a0a',
        TREE_TRUNK: '#3a2a1a',
        TREE_LEAVES: '#5a4a2a',    // Brown-ish leaves (autumn)
        TREE_LEAVES_LIGHT: '#7a5a3a'
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

