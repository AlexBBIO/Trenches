// UI Module - HUD, selection, menus
import { GameState } from './game.js';

export class UI {
    constructor(game) {
        this.game = game;
        
        // Cache DOM elements
        this.mainMenu = document.getElementById('main-menu');
        this.gameOver = document.getElementById('game-over');
        this.hud = document.getElementById('hud');
        this.minimap = document.getElementById('minimap');
        
        this.manpowerDisplay = document.getElementById('manpower');
        this.suppliesDisplay = document.getElementById('supplies');
        this.shellsDisplay = document.getElementById('shells');
        this.selectionInfo = document.getElementById('selection-info');
        this.selectedCount = document.getElementById('selected-count');
        
        this.toolbar = document.getElementById('toolbar');
        this.toolButtons = document.querySelectorAll('.tool-btn');
        
        // Cargo slider elements
        this.cargoSlider = document.getElementById('cargo-slider');
        this.previewSoldiers = document.getElementById('preview-soldiers');
        this.previewWorkers = document.getElementById('preview-workers');
        this.previewShells = document.getElementById('preview-shells');
        
        // Setup event listeners
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Start button
        document.getElementById('start-btn').addEventListener('click', () => {
            this.game.startGame();
        });
        
        // Restart button
        document.getElementById('restart-btn').addEventListener('click', () => {
            this.hideGameOver();
            this.game.startGame();
        });
        
        // Tool buttons
        this.toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                this.game.setTool(tool);
            });
        });
        
        // Action buttons
        document.getElementById('charge-btn').addEventListener('click', () => {
            this.game.orderCharge();
        });
        
        document.getElementById('retreat-btn').addEventListener('click', () => {
            this.game.orderRetreat();
        });
        
        // Minimap click
        this.minimap.addEventListener('click', (e) => {
            this.handleMinimapClick(e);
        });
        
        // Cargo slider
        if (this.cargoSlider) {
            this.cargoSlider.addEventListener('input', (e) => {
                const ratio = parseInt(e.target.value);
                this.game.trainSystem.setCargoRatio(ratio);
                this.updateCargoPreview();
            });
        }
    }
    
    updateCargoPreview() {
        if (!this.game.trainSystem) return;
        
        const cargo = this.game.trainSystem.getCargoAmounts(true);
        
        if (this.previewSoldiers) {
            this.previewSoldiers.textContent = `👥 ${cargo.soldiers}`;
        }
        if (this.previewWorkers) {
            this.previewWorkers.textContent = `🔧 ${cargo.workers}`;
        }
        if (this.previewShells) {
            this.previewShells.textContent = `💣 ${cargo.shells}`;
        }
    }
    
    handleMinimapClick(e) {
        const rect = this.minimap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Convert to world coordinates
        const worldX = (x / this.minimap.width) * 2000; // CONFIG.MAP_WIDTH
        const worldY = (y / this.minimap.height) * 1200; // CONFIG.MAP_HEIGHT
        
        // Move camera
        this.game.renderer.camera.x = worldX;
        this.game.renderer.camera.y = worldY;
    }
    
    showHUD() {
        this.mainMenu.classList.add('hidden');
        this.gameOver.classList.add('hidden');
        this.hud.classList.remove('hidden');
        this.minimap.classList.remove('hidden');
        
        // Set minimap size
        this.minimap.width = 200;
        this.minimap.height = 150;
        
        // Initialize cargo preview
        this.updateCargoPreview();
    }
    
    hideHUD() {
        this.hud.classList.add('hidden');
        this.minimap.classList.add('hidden');
    }
    
    showMainMenu() {
        this.mainMenu.classList.remove('hidden');
        this.hideHUD();
    }
    
    showGameOver(victory) {
        const title = document.getElementById('game-over-title');
        const message = document.getElementById('game-over-message');
        
        if (victory) {
            title.textContent = 'VICTORY!';
            title.style.color = '#4a9';
            message.textContent = 'You have captured the enemy headquarters!';
        } else {
            title.textContent = 'DEFEAT';
            title.style.color = '#a44';
            message.textContent = 'Your headquarters has been overrun...';
        }
        
        this.gameOver.classList.remove('hidden');
    }
    
    hideGameOver() {
        this.gameOver.classList.add('hidden');
    }
    
    update() {
        // Update resource displays
        this.manpowerDisplay.textContent = this.game.resources.manpower;
        this.suppliesDisplay.textContent = Math.floor(this.game.resources.supplies);
        if (this.shellsDisplay) {
            this.shellsDisplay.textContent = this.game.resources.shells;
        }
        
        // Slowly regenerate supplies
        this.game.resources.supplies = Math.min(
            200, 
            this.game.resources.supplies + this.game.deltaTime * 2
        );
    }
    
    updateToolbar(activeTool) {
        this.toolButtons.forEach(btn => {
            if (btn.dataset.tool === activeTool) {
                btn.classList.add('active');
                // Flash animation
                btn.classList.remove('flash');
                void btn.offsetWidth; // Trigger reflow
                btn.classList.add('flash');
            } else {
                btn.classList.remove('active');
                btn.classList.remove('flash');
            }
        });
        
        // Show tool name popup
        const toolNames = {
            'select': 'SELECT',
            'trench': 'DIG TRENCH',
            'machinegun': 'MACHINE GUN',
            'artillery': 'ARTILLERY',
            'barbed': 'BARBED WIRE'
        };
        
        const toolNameEl = document.getElementById('tool-name');
        toolNameEl.textContent = toolNames[activeTool] || activeTool.toUpperCase();
        toolNameEl.classList.remove('hidden');
        
        // Reset animation
        toolNameEl.style.animation = 'none';
        void toolNameEl.offsetWidth;
        toolNameEl.style.animation = '';
        
        // Hide after animation
        setTimeout(() => {
            toolNameEl.classList.add('hidden');
        }, 1000);
    }
    
    updateSelection(units) {
        if (units.length === 0) {
            this.selectionInfo.classList.add('hidden');
            return;
        }
        
        this.selectionInfo.classList.remove('hidden');
        
        // Count by type
        const soldiers = units.filter(u => u.type === 'soldier').length;
        const workers = units.filter(u => u.type === 'worker').length;
        
        let text = '';
        if (soldiers > 0) text += `${soldiers} soldier${soldiers > 1 ? 's' : ''}`;
        if (soldiers > 0 && workers > 0) text += ', ';
        if (workers > 0) text += `${workers} worker${workers > 1 ? 's' : ''}`;
        
        this.selectedCount.textContent = text + ' selected';
    }
}

