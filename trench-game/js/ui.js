// UI Module - HUD, selection, menus
import { GameState, CONFIG } from './game.js';
import { TRAIN_COSTS } from './trains.js';

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
        
        // Train order elements
        this.orderSoldiers = document.getElementById('order-soldiers');
        this.orderWorkers = document.getElementById('order-workers');
        this.orderShells = document.getElementById('order-shells');
        this.orderTotalCost = document.getElementById('order-total-cost');
        this.orderTrainBtn = document.getElementById('order-train-btn');
        this.trainOrderForm = document.getElementById('train-order-form');
        this.trainPending = document.getElementById('train-pending');
        this.trainTimer = document.getElementById('train-timer');
        
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
        
        // Quick select buttons
        document.getElementById('select-soldiers-btn').addEventListener('click', () => {
            this.selectAllOfType('soldier');
        });
        
        document.getElementById('select-workers-btn').addEventListener('click', () => {
            this.selectAllOfType('worker');
        });
        
        // Minimap click
        this.minimap.addEventListener('click', (e) => {
            this.handleMinimapClick(e);
        });
        
        // Train order form - number inputs
        [this.orderSoldiers, this.orderWorkers, this.orderShells].forEach(input => {
            if (input) {
                input.addEventListener('input', () => this.updateOrderCost());
                input.addEventListener('change', () => this.updateOrderCost());
            }
        });
        
        // Train order form - plus/minus buttons
        document.querySelectorAll('.order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                const input = document.getElementById(targetId);
                if (!input) return;
                
                const isPlus = e.target.classList.contains('plus');
                const currentVal = parseInt(input.value) || 0;
                const max = parseInt(input.max) || 99;
                const min = parseInt(input.min) || 0;
                
                if (isPlus) {
                    input.value = Math.min(max, currentVal + 1);
                } else {
                    input.value = Math.max(min, currentVal - 1);
                }
                
                this.updateOrderCost();
            });
        });
        
        // Order train button
        if (this.orderTrainBtn) {
            this.orderTrainBtn.addEventListener('click', () => this.handleOrderTrain());
        }
    }
    
    // Update the cost display for train orders
    updateOrderCost() {
        if (!this.orderSoldiers || !this.orderWorkers || !this.orderShells) return;
        
        const soldiers = parseInt(this.orderSoldiers.value) || 0;
        const workers = parseInt(this.orderWorkers.value) || 0;
        const shells = parseInt(this.orderShells.value) || 0;
        
        // Update individual costs
        const costSoldiers = document.getElementById('cost-soldiers');
        const costWorkers = document.getElementById('cost-workers');
        const costShells = document.getElementById('cost-shells');
        
        if (costSoldiers) costSoldiers.textContent = soldiers * TRAIN_COSTS.soldier;
        if (costWorkers) costWorkers.textContent = workers * TRAIN_COSTS.worker;
        if (costShells) costShells.textContent = shells * TRAIN_COSTS.shell;
        
        // Update total
        const total = (soldiers * TRAIN_COSTS.soldier) + 
                      (workers * TRAIN_COSTS.worker) + 
                      (shells * TRAIN_COSTS.shell);
        
        if (this.orderTotalCost) {
            this.orderTotalCost.textContent = `${total} ⚙️`;
        }
        
        // Update button state based on affordability
        if (this.orderTrainBtn) {
            const canAfford = this.game.resources.supplies >= total && total > 0;
            this.orderTrainBtn.disabled = !canAfford;
            this.orderTrainBtn.classList.toggle('disabled', !canAfford);
        }
    }
    
    // Handle ordering a train
    handleOrderTrain() {
        if (!this.game.trainSystem) return;
        
        const soldiers = parseInt(this.orderSoldiers.value) || 0;
        const workers = parseInt(this.orderWorkers.value) || 0;
        const shells = parseInt(this.orderShells.value) || 0;
        
        const result = this.game.trainSystem.orderTrain(soldiers, workers, shells);
        
        if (result.success) {
            // Show pending status, hide order form
            this.showTrainPending();
        } else {
            // Could show an error message, but for now just flash the button
            this.orderTrainBtn.classList.add('error');
            setTimeout(() => this.orderTrainBtn.classList.remove('error'), 300);
        }
    }
    
    // Show the pending train status
    showTrainPending() {
        if (this.trainOrderForm) this.trainOrderForm.classList.add('hidden');
        if (this.trainPending) this.trainPending.classList.remove('hidden');
    }
    
    // Show the order form (when no train is pending)
    showTrainOrderForm() {
        if (this.trainOrderForm) this.trainOrderForm.classList.remove('hidden');
        if (this.trainPending) this.trainPending.classList.add('hidden');
        this.updateOrderCost();
    }
    
    // Update train pending timer display
    updateTrainStatus() {
        const trainSystem = this.game.trainSystem;
        if (!trainSystem) return;
        
        if (trainSystem.pendingOrder) {
            // Show pending status
            if (this.trainOrderForm && !this.trainOrderForm.classList.contains('hidden')) {
                this.showTrainPending();
            }
            
            // Update timer
            const timeLeft = Math.ceil(trainSystem.pendingOrder.arrivalTime);
            if (this.trainTimer) {
                this.trainTimer.textContent = `${timeLeft}s`;
            }
        } else {
            // No pending order, show the form
            if (this.trainPending && !this.trainPending.classList.contains('hidden')) {
                this.showTrainOrderForm();
            }
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
        
        // Initialize train order form
        this.showTrainOrderForm();
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
        
        // Update train order status
        this.updateTrainStatus();
        
        // Update order button state (in case supplies changed)
        if (!this.game.trainSystem.pendingOrder) {
            this.updateOrderCost();
        }
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
    
    selectAllOfType(unitType) {
        const units = this.game.unitManager.units.filter(u => 
            u.type === unitType && 
            u.team === CONFIG.TEAM_PLAYER && 
            u.state !== 'dead'
        );
        
        // Clear current selection
        this.game.clearSelection();
        
        // Select all of this type
        units.forEach(unit => {
            unit.selected = true;
            this.game.selectedUnits.push(unit);
        });
        
        // Update UI
        this.updateSelection(this.game.selectedUnits);
        
        // Switch to select tool
        this.game.setTool('select');
    }
}

