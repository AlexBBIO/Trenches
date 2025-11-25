// UI Module - HUD, selection, menus
import { GameState, CONFIG } from './game.js';
import { TRAIN_COSTS } from './trains.js';

// Building costs for display
export const BUILDING_COSTS = {
    'machinegun': 25,
    'artillery': 50,
    'barbed': 10,
    'medical_tent': 30,
    'bunker': 40,
    'observation_post': 20,
    'supply_depot': 35,
    'mortar': 30
};

// Building display info
export const BUILDING_INFO = {
    'machinegun': { icon: '🔫', name: 'MACHINE GUN' },
    'artillery': { icon: '💥', name: 'ARTILLERY' },
    'barbed': { icon: '🪤', name: 'BARBED WIRE' },
    'medical_tent': { icon: '🏥', name: 'MEDICAL TENT' },
    'bunker': { icon: '🏰', name: 'BUNKER' },
    'observation_post': { icon: '🗼', name: 'OBSERVATION POST' },
    'supply_depot': { icon: '📦', name: 'SUPPLY DEPOT' },
    'mortar': { icon: '🎆', name: 'MORTAR PIT' },
    'hq': { icon: '🏛️', name: 'HEADQUARTERS' }
};

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
        
        // Stats bar elements
        this.statWorkersDisplay = document.getElementById('stat-workers');
        this.statSoldiersDisplay = document.getElementById('stat-soldiers');
        this.statEnemiesKilledDisplay = document.getElementById('stat-enemies-killed');
        this.statFriendliesKilledDisplay = document.getElementById('stat-friendlies-killed');
        
        this.toolbar = document.getElementById('toolbar');
        this.toolButtons = document.querySelectorAll('.tool-btn');
        
        // Building info panel elements
        this.buildingInfo = document.getElementById('building-info');
        this.buildingIcon = document.getElementById('building-icon');
        this.buildingName = document.getElementById('building-name');
        this.buildingHealthFill = document.getElementById('building-health-fill');
        this.buildingHealthText = document.getElementById('building-health-text');
        this.buildingStatus = document.getElementById('building-status');
        this.buildingActions = document.getElementById('building-actions');
        
        // Currently selected building
        this.selectedBuilding = null;
        
        // Train order elements
        this.orderSoldiers = document.getElementById('order-soldiers');
        this.orderWorkers = document.getElementById('order-workers');
        this.orderShells = document.getElementById('order-shells');
        this.orderTotalCost = document.getElementById('order-total-cost');
        this.orderTrainBtn = document.getElementById('order-train-btn');
        this.trainOrderForm = document.getElementById('train-order-form');
        this.trainPending = document.getElementById('train-pending');
        this.trainTimer = document.getElementById('train-timer');
        this.autoCallTrainCheckbox = document.getElementById('auto-call-train');
        
        // Scout flyover elements (disabled for now)
        // this.scoutFlyoverBtn = document.getElementById('scout-flyover-btn');
        // this.scoutCooldown = document.getElementById('scout-cooldown');
        // this.scoutCooldownText = document.getElementById('scout-cooldown-text');
        
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
        
        // Scout flyover disabled for now
        // if (this.scoutFlyoverBtn) {
        //     this.scoutFlyoverBtn.addEventListener('click', () => this.handleScoutFlyover());
        // }
        // document.addEventListener('keydown', (e) => {
        //     if (e.key === 'f' || e.key === 'F') {
        //         if (this.game.state === 'playing') {
        //             this.handleScoutFlyover();
        //         }
        //     }
        // });
    }
    
    // Scout flyover methods disabled for now
    // handleScoutFlyover() {
    //     if (!this.game.scoutFlyover) return;
    //     if (this.game.startScoutFlyover()) {
    //         this.scoutFlyoverBtn.classList.add('active');
    //     }
    // }
    // updateScoutFlyoverStatus() { ... }
    
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
    
    // Show the pending train status (inline, form stays visible)
    showTrainPending() {
        if (this.trainPending) this.trainPending.classList.remove('hidden');
    }
    
    // Hide the pending status (when no train is pending)
    hideTrainPending() {
        if (this.trainPending) this.trainPending.classList.add('hidden');
    }
    
    // Show the order form (when no train is pending)
    showTrainOrderForm() {
        if (this.trainOrderForm) this.trainOrderForm.classList.remove('hidden');
        this.hideTrainPending();
        this.updateOrderCost();
    }
    
    // Update train pending timer display
    updateTrainStatus() {
        const trainSystem = this.game.trainSystem;
        if (!trainSystem) return;
        
        if (trainSystem.pendingOrder) {
            // Show pending status inline (form stays visible)
            this.showTrainPending();
            
            // Update timer
            const timeLeft = Math.ceil(trainSystem.pendingOrder.arrivalTime);
            if (this.trainTimer) {
                this.trainTimer.textContent = `${timeLeft}s`;
            }
        } else {
            // No pending order, hide the timer
            this.hideTrainPending();
            
            // Auto-call train if enabled and we can afford it
            this.checkAutoCallTrain();
        }
    }
    
    // Check if we should auto-call a train
    checkAutoCallTrain() {
        // Make sure checkbox exists and is checked
        if (!this.autoCallTrainCheckbox || !this.autoCallTrainCheckbox.checked) return;
        
        // Make sure train system exists and no order is pending
        if (!this.game.trainSystem || this.game.trainSystem.pendingOrder) return;
        
        // Get the current order values
        const soldiers = parseInt(this.orderSoldiers?.value) || 0;
        const workers = parseInt(this.orderWorkers?.value) || 0;
        const shells = parseInt(this.orderShells?.value) || 0;
        
        // Must have something to order
        if (soldiers + workers + shells === 0) return;
        
        // Check if we can afford it
        if (this.game.trainSystem.canAffordOrder(soldiers, workers, shells)) {
            // Auto-order the train!
            this.handleOrderTrain();
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
        
        // Update stats bar
        this.updateStatsBar();
        
        // Regenerate supplies based on battlefield deaths (high command allocates more as battle heats up)
        const depotBonus = this.game.buildingManager.getSupplyRegenBonus(CONFIG.TEAM_PLAYER);
        const totalDead = this.game.stats.enemiesKilled + this.game.stats.friendliesKilled;
        const deathBonus = totalDead * 0.02; // +0.02 supply/sec per death on battlefield
        const baseRegen = 1; // Lower base (was 2)
        const actualRegen = (baseRegen + deathBonus) * (1 + depotBonus);
        this.game.resources.supplies = Math.min(
            200, 
            this.game.resources.supplies + this.game.deltaTime * actualRegen
        );
        
        // Update train order status
        this.updateTrainStatus();
        
        // Update order button state (in case supplies changed)
        if (!this.game.trainSystem.pendingOrder) {
            this.updateOrderCost();
        }
        
        // Scout flyover disabled for now
        // this.updateScoutFlyoverStatus();
        
        // Update building info panel if a building is selected
        if (this.selectedBuilding) {
            // Check if building still exists and isn't destroyed
            if (this.selectedBuilding.destroyed) {
                this.deselectBuilding();
            } else {
                this.updateBuildingInfo();
            }
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
        
        // Show tool name popup with cost
        const toolNames = {
            'select': 'SELECT',
            'trench': 'DIG TRENCH',
            'machinegun': 'MACHINE GUN',
            'artillery': 'ARTILLERY',
            'barbed': 'BARBED WIRE',
            'medical_tent': 'MEDICAL TENT',
            'bunker': 'BUNKER',
            'observation_post': 'OBSERVATION POST',
            'supply_depot': 'SUPPLY DEPOT',
            'mortar': 'MORTAR PIT'
        };
        
        const toolNameEl = document.getElementById('tool-name');
        let displayText = toolNames[activeTool] || activeTool.toUpperCase();
        
        // Add cost if it's a building
        const cost = BUILDING_COSTS[activeTool];
        if (cost) {
            displayText += ` (${cost}⚙️)`;
        }
        
        toolNameEl.textContent = displayText;
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
    
    // Select a building and show its info panel
    selectBuilding(building) {
        // Clear unit selection when selecting a building
        this.game.clearSelection();
        
        this.selectedBuilding = building;
        building.selected = true;
        
        this.updateBuildingInfo();
        this.buildingInfo.classList.remove('hidden');
        this.selectionInfo.classList.add('hidden');
    }
    
    // Deselect the current building
    deselectBuilding() {
        if (this.selectedBuilding) {
            this.selectedBuilding.selected = false;
            this.selectedBuilding = null;
        }
        this.buildingInfo.classList.add('hidden');
    }
    
    // Update building info panel
    updateBuildingInfo() {
        const building = this.selectedBuilding;
        if (!building) return;
        
        // Get building display info
        const info = BUILDING_INFO[building.type] || { icon: '🏗️', name: building.type.toUpperCase() };
        
        this.buildingIcon.textContent = info.icon;
        this.buildingName.textContent = info.name;
        
        // Update health bar
        const healthPercent = (building.health / building.maxHealth) * 100;
        this.buildingHealthFill.style.width = `${healthPercent}%`;
        this.buildingHealthText.textContent = `${Math.ceil(building.health)}/${building.maxHealth}`;
        
        // Update health bar color based on health
        if (healthPercent > 60) {
            this.buildingHealthFill.style.background = 'linear-gradient(180deg, #6a9a4a 0%, #4a7a2a 100%)';
        } else if (healthPercent > 30) {
            this.buildingHealthFill.style.background = 'linear-gradient(180deg, #9a8a4a 0%, #7a6a2a 100%)';
        } else {
            this.buildingHealthFill.style.background = 'linear-gradient(180deg, #9a4a4a 0%, #7a2a2a 100%)';
        }
        
        // Build status info
        let statusHTML = '';
        
        switch (building.type) {
            case 'bunker':
                statusHTML += `<div class="status-row"><span class="status-label">Occupants</span><span class="status-value">${building.occupants.length}/${building.capacity}</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Protection</span><span class="status-value">${Math.round(building.protection * 100)}%</span></div>`;
                break;
                
            case 'medical_tent':
                const nearbyWounded = this.game.unitManager.units.filter(u =>
                    u.team === building.team &&
                    u.state !== 'dead' &&
                    u.health < u.maxHealth &&
                    Math.sqrt((u.x - building.x) ** 2 + (u.y - building.y) ** 2) <= building.healRange
                ).length;
                statusHTML += `<div class="status-row"><span class="status-label">Heal Rate</span><span class="status-value">${building.healRate} HP/s</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Wounded Nearby</span><span class="status-value">${nearbyWounded}</span></div>`;
                break;
                
            case 'observation_post':
                const isManned = building.assignedUnit && building.assignedUnit.state !== 'dead';
                statusHTML += `<div class="status-row"><span class="status-label">Status</span><span class="status-value">${isManned ? '✓ Manned' : '✗ Unmanned'}</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Vision Range</span><span class="status-value">${building.visionRange}px</span></div>`;
                break;
                
            case 'supply_depot':
                statusHTML += `<div class="status-row"><span class="status-label">Shell Storage</span><span class="status-value">+${building.shellStorage}</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Supply Bonus</span><span class="status-value">+${Math.round(building.supplyBonus * 100)}%</span></div>`;
                break;
                
            case 'mortar':
                const mortarManned = building.assignedUnit && building.assignedUnit.state !== 'dead';
                statusHTML += `<div class="status-row"><span class="status-label">Status</span><span class="status-value">${mortarManned ? '✓ Manned' : '✗ Unmanned'}</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Range</span><span class="status-value">${building.range}px</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Ammo/Shot</span><span class="status-value">${building.ammoPerShot} shells</span></div>`;
                break;
                
            case 'artillery':
                const artilleryManned = building.assignedUnit && building.assignedUnit.state !== 'dead';
                statusHTML += `<div class="status-row"><span class="status-label">Status</span><span class="status-value">${artilleryManned ? '✓ Manned' : '✗ Unmanned'}</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Range</span><span class="status-value">${building.range}px</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Ammo</span><span class="status-value">${this.game.resources.shells} shells</span></div>`;
                break;
                
            case 'machinegun':
                const mgManned = building.assignedUnit && building.assignedUnit.state !== 'dead';
                statusHTML += `<div class="status-row"><span class="status-label">Status</span><span class="status-value">${mgManned ? '✓ Manned' : '✗ Unmanned'}</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Range</span><span class="status-value">${building.range}px</span></div>`;
                statusHTML += `<div class="status-row"><span class="status-label">Fire Rate</span><span class="status-value">${building.fireRate}/s</span></div>`;
                break;
                
            case 'hq':
                statusHTML += `<div class="status-row"><span class="status-label">Team</span><span class="status-value">${building.team === CONFIG.TEAM_PLAYER ? 'Friendly' : 'Enemy'}</span></div>`;
                break;
        }
        
        this.buildingStatus.innerHTML = statusHTML;
        
        // Build action buttons
        let actionsHTML = '';
        
        // Priority repair button (for damaged buildings)
        if (building.health < building.maxHealth && !building.priorityRepair) {
            actionsHTML += `<button class="building-action-btn priority" data-action="priority-repair">🔧 Priority Repair</button>`;
        } else if (building.priorityRepair) {
            actionsHTML += `<button class="building-action-btn" data-action="cancel-priority">✓ Priority Set</button>`;
        }
        
        // Building-specific actions
        if (building.type === 'bunker' && building.occupants.length > 0) {
            actionsHTML += `<button class="building-action-btn" data-action="empty-bunker">🚪 Empty Bunker</button>`;
        }
        
        // Demolish button (not for HQ)
        if (building.type !== 'hq' && building.team === CONFIG.TEAM_PLAYER) {
            actionsHTML += `<button class="building-action-btn danger" data-action="demolish">💣 Demolish</button>`;
        }
        
        this.buildingActions.innerHTML = actionsHTML;
        
        // Attach event listeners to action buttons
        this.buildingActions.querySelectorAll('.building-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleBuildingAction(e.target.dataset.action));
        });
    }
    
    // Handle building action button clicks
    handleBuildingAction(action) {
        const building = this.selectedBuilding;
        if (!building) return;
        
        switch (action) {
            case 'priority-repair':
                building.priorityRepair = true;
                this.updateBuildingInfo();
                break;
                
            case 'cancel-priority':
                building.priorityRepair = false;
                this.updateBuildingInfo();
                break;
                
            case 'empty-bunker':
                if (building.type === 'bunker') {
                    // Eject all occupants
                    const occupants = [...building.occupants];
                    for (const occupant of occupants) {
                        this.game.buildingManager.exitBunker(occupant);
                    }
                    this.updateBuildingInfo();
                }
                break;
                
            case 'demolish':
                // Confirm demolition
                building.health = 0;
                this.game.buildingManager.takeDamage(building, 0, null);
                this.deselectBuilding();
                break;
        }
    }
    
    // Update the stats bar display
    updateStatsBar() {
        const units = this.game.unitManager.units;
        const playerTeam = CONFIG.TEAM_PLAYER;
        
        // Count living player workers and soldiers
        const workers = units.filter(u => 
            u.team === playerTeam && 
            u.type === 'worker' && 
            u.state !== 'dead'
        ).length;
        
        const soldiers = units.filter(u => 
            u.team === playerTeam && 
            u.type === 'soldier' && 
            u.state !== 'dead'
        ).length;
        
        // Update displays
        if (this.statWorkersDisplay) {
            this.statWorkersDisplay.textContent = workers;
        }
        if (this.statSoldiersDisplay) {
            this.statSoldiersDisplay.textContent = soldiers;
        }
        if (this.statEnemiesKilledDisplay) {
            this.statEnemiesKilledDisplay.textContent = this.game.stats.enemiesKilled;
        }
        if (this.statFriendliesKilledDisplay) {
            this.statFriendliesKilledDisplay.textContent = this.game.stats.friendliesKilled;
        }
    }
}

