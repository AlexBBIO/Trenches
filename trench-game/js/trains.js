// Trains Module - Train logistics and reinforcement system
import { CONFIG } from './game.js';

// Train order costs (in supplies)
export const TRAIN_COSTS = {
    soldier: 8,
    worker: 10,
    shell: 3
};

// Time for ordered train to arrive (in seconds)
export const TRAIN_ARRIVAL_TIME = 60;

export class TrainSystem {
    constructor(game) {
        this.game = game;
        this.trains = [];
        this.trainIdCounter = 0;
        
        // Enemy train timer (player trains are now on-demand)
        this.enemyTrainTimer = 0;
        this.enemyInterval = CONFIG.TRAIN_INTERVAL * 1.2; // Enemy slightly slower
        
        // Pending player train orders
        this.pendingOrder = null; // { soldiers, workers, shells, arrivalTime }
    }
    
    // Calculate the cost for a train order
    calculateOrderCost(soldiers, workers, shells) {
        return (soldiers * TRAIN_COSTS.soldier) + 
               (workers * TRAIN_COSTS.worker) + 
               (shells * TRAIN_COSTS.shell);
    }
    
    // Check if player can afford an order
    canAffordOrder(soldiers, workers, shells) {
        const cost = this.calculateOrderCost(soldiers, workers, shells);
        return this.game.resources.supplies >= cost;
    }
    
    // Order a train with specific cargo
    orderTrain(soldiers, workers, shells) {
        // Can't order if one is already pending
        if (this.pendingOrder) {
            return { success: false, reason: 'Train already ordered' };
        }
        
        // Validate quantities
        soldiers = Math.max(0, Math.floor(soldiers));
        workers = Math.max(0, Math.floor(workers));
        shells = Math.max(0, Math.floor(shells));
        
        // Must order something
        if (soldiers + workers + shells === 0) {
            return { success: false, reason: 'Must order at least one item' };
        }
        
        const cost = this.calculateOrderCost(soldiers, workers, shells);
        
        // Check if can afford
        if (!this.game.spendSupplies(cost)) {
            return { success: false, reason: 'Not enough supplies' };
        }
        
        // Schedule the train
        this.pendingOrder = {
            soldiers,
            workers,
            shells,
            arrivalTime: TRAIN_ARRIVAL_TIME
        };
        
        return { success: true, cost };
    }
    
    // Get cargo amounts for enemy trains (unchanged)
    getCargoAmounts() {
        return {
            soldiers: CONFIG.SOLDIERS_PER_TRAIN,
            workers: CONFIG.WORKERS_PER_TRAIN,
            shells: 8
        };
    }
    
    // Resupply enemy artillery directly from trains
    resupplyEnemyArtillery(shellCount) {
        const enemyArtillery = this.game.buildingManager.buildings.filter(b =>
            b.team === CONFIG.TEAM_ENEMY &&
            b.type === 'artillery' &&
            !b.destroyed &&
            !b.isBlueprint &&
            b.ammoCount < b.maxAmmo
        ).sort((a, b) => a.ammoCount - b.ammoCount);
        
        let remainingShells = shellCount;
        
        for (const art of enemyArtillery) {
            if (remainingShells <= 0) break;
            
            const needed = art.maxAmmo - art.ammoCount;
            const toAdd = Math.min(needed, remainingShells);
            art.ammoCount += toAdd;
            remainingShells -= toAdd;
        }
    }
    
    start() {
        // Schedule first enemy train
        this.enemyTrainTimer = this.enemyInterval / 2;
        this.pendingOrder = null;
    }
    
    update(dt) {
        // Update enemy train timer
        this.enemyTrainTimer -= dt * 1000;
        
        // Spawn enemy train
        if (this.enemyTrainTimer <= 0) {
            this.spawnTrain(CONFIG.TEAM_ENEMY);
            this.enemyTrainTimer = this.enemyInterval;
        }
        
        // Update pending player order
        if (this.pendingOrder) {
            this.pendingOrder.arrivalTime -= dt;
            
            if (this.pendingOrder.arrivalTime <= 0) {
                // Spawn the player's ordered train
                this.spawnPlayerTrain(this.pendingOrder);
                this.pendingOrder = null;
            }
        }
        
        // Update existing trains
        for (let i = this.trains.length - 1; i >= 0; i--) {
            const train = this.trains[i];
            this.updateTrain(train, dt);
            
            // Remove trains that have left
            if (train.state === 'departed') {
                this.trains.splice(i, 1);
            }
        }
    }
    
    // Spawn a player train with specific cargo from an order
    spawnPlayerTrain(order) {
        const train = {
            id: this.trainIdCounter++,
            team: CONFIG.TEAM_PLAYER,
            x: -200,
            y: CONFIG.MAP_HEIGHT / 2,
            targetX: 50,
            speed: 150,
            state: 'arriving',
            stopTime: 0,
            maxStopTime: 3,
            soldiers: order.soldiers,
            workers: order.workers,
            shells: order.shells,
            unloaded: false,
            wagons: 3
        };
        
        this.trains.push(train);
    }
    
    // Spawn enemy train (automatic)
    spawnTrain(team) {
        const cargo = this.getCargoAmounts();
        
        const train = {
            id: this.trainIdCounter++,
            team,
            x: CONFIG.MAP_WIDTH + 200,
            y: CONFIG.MAP_HEIGHT / 2,
            targetX: CONFIG.MAP_WIDTH - 50,
            speed: 150,
            state: 'arriving', // arriving, stopped, departing, departed
            stopTime: 0,
            maxStopTime: 3, // Seconds to unload
            soldiers: cargo.soldiers,
            workers: cargo.workers,
            shells: cargo.shells,
            unloaded: false,
            wagons: 3
        };
        
        this.trains.push(train);
    }
    
    updateTrain(train, dt) {
        switch (train.state) {
            case 'arriving':
                this.updateArriving(train, dt);
                break;
            case 'stopped':
                this.updateStopped(train, dt);
                break;
            case 'departing':
                this.updateDeparting(train, dt);
                break;
        }
    }
    
    updateArriving(train, dt) {
        const isPlayer = train.team === CONFIG.TEAM_PLAYER;
        const direction = isPlayer ? 1 : -1;
        
        train.x += train.speed * dt * direction;
        
        // Check if arrived
        if ((isPlayer && train.x >= train.targetX) ||
            (!isPlayer && train.x <= train.targetX)) {
            train.x = train.targetX;
            train.state = 'stopped';
            train.stopTime = 0;
        }
    }
    
    updateStopped(train, dt) {
        train.stopTime += dt;
        
        // Unload troops partway through stop
        if (!train.unloaded && train.stopTime >= train.maxStopTime * 0.3) {
            this.unloadTroops(train);
            train.unloaded = true;
        }
        
        // Depart after stop time
        if (train.stopTime >= train.maxStopTime) {
            train.state = 'departing';
        }
    }
    
    updateDeparting(train, dt) {
        const isPlayer = train.team === CONFIG.TEAM_PLAYER;
        const direction = isPlayer ? -1 : 1; // Reverse direction
        
        train.x += train.speed * dt * direction;
        
        // Check if gone
        if ((isPlayer && train.x < -250) ||
            (!isPlayer && train.x > CONFIG.MAP_WIDTH + 250)) {
            train.state = 'departed';
        }
    }
    
    unloadTroops(train) {
        const isPlayer = train.team === CONFIG.TEAM_PLAYER;
        const spawnX = train.x + (isPlayer ? 30 : -30);
        
        // Spawn soldiers
        for (let i = 0; i < train.soldiers; i++) {
            const offsetY = (i - train.soldiers / 2) * 25;
            const x = spawnX + Math.random() * 20;
            const y = train.y + offsetY + (Math.random() - 0.5) * 10;
            
            const soldier = this.game.unitManager.spawnUnit('soldier', x, y, train.team);
            
            // Auto-assign to trench or emplacement
            if (isPlayer) {
                this.game.unitManager.autoAssignSoldier(soldier);
            }
        }
        
        // Spawn workers
        for (let i = 0; i < train.workers; i++) {
            const offsetY = (i - train.workers / 2) * 30;
            const x = spawnX + Math.random() * 20 + 20;
            const y = train.y + offsetY + (Math.random() - 0.5) * 10;
            
            this.game.unitManager.spawnUnit('worker', x, y, train.team);
        }
        
        // Deliver shells to storage
        if (train.shells > 0) {
            if (isPlayer) {
                // Player shells go to resource stockpile
                this.game.resources.shells = Math.min(
                    CONFIG.MAX_SHELLS,
                    this.game.resources.shells + train.shells
                );
                
                // Visual effect for shell delivery
                this.game.addEffect('muzzle', train.x, train.y - 20, {
                    size: 15,
                    duration: 0.3
                });
            } else {
                // Enemy shells directly resupply their artillery
                this.resupplyEnemyArtillery(train.shells);
            }
        }
        
        // Update manpower for player
        if (isPlayer) {
            this.game.addManpower(train.soldiers + train.workers);
        }
    }
    
    render(ctx) {
        for (const train of this.trains) {
            this.renderTrain(ctx, train);
        }
    }
    
    renderTrain(ctx, train) {
        ctx.save();
        ctx.translate(train.x, train.y);
        
        const isPlayer = train.team === CONFIG.TEAM_PLAYER;
        const flip = isPlayer ? 1 : -1;
        
        ctx.scale(flip, 1);
        
        // Draw wagons (back to front)
        for (let w = train.wagons - 1; w >= 0; w--) {
            this.renderWagon(ctx, -w * 55 - 60, 0, train.team);
        }
        
        // Draw locomotive
        this.renderLocomotive(ctx, 0, 0, train.team);
        
        // Steam/smoke effect when moving
        if (train.state === 'arriving' || train.state === 'departing') {
            this.renderSteam(ctx, train);
        }
        
        ctx.restore();
    }
    
    renderLocomotive(ctx, x, y, team) {
        const isEnemy = team === CONFIG.TEAM_ENEMY;
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(x + 10, y + 25, 45, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Main boiler body
        const bodyColor = isEnemy ? '#3a2515' : '#1a3520';
        const trimColor = isEnemy ? '#4a3525' : '#2a4530';
        
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x - 30, y - 22, 75, 38);
        
        // Boiler (cylindrical appearance)
        ctx.fillStyle = trimColor;
        ctx.beginPath();
        ctx.ellipse(x + 15, y - 3, 35, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(x + 15, y - 3, 33, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Boiler bands
        ctx.strokeStyle = '#4a4a4a';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const bx = x - 15 + i * 15;
            ctx.beginPath();
            ctx.moveTo(bx, y - 18);
            ctx.lineTo(bx, y + 12);
            ctx.stroke();
        }
        
        // Cabin
        ctx.fillStyle = trimColor;
        ctx.fillRect(x - 32, y - 38, 38, 22);
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x - 30, y - 36, 34, 18);
        
        // Cabin roof
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(x - 35, y - 42, 42, 6);
        
        // Window
        ctx.fillStyle = '#2a4a5a';
        ctx.fillRect(x - 26, y - 32, 14, 10);
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 26, y - 32, 14, 10);
        
        // Smokestack - WWI era cylindrical
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(x + 22, y - 50, 14, 32);
        
        // Stack funnel top
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.moveTo(x + 20, y - 50);
        ctx.lineTo(x + 38, y - 50);
        ctx.lineTo(x + 36, y - 58);
        ctx.lineTo(x + 22, y - 58);
        ctx.closePath();
        ctx.fill();
        
        // Stack rim
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(x + 19, y - 52, 20, 4);
        
        // Front lamp
        ctx.fillStyle = '#5a5a5a';
        ctx.beginPath();
        ctx.arc(x + 50, y - 5, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a8a6a';
        ctx.beginPath();
        ctx.arc(x + 50, y - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Wheels - WWI era spoked
        const wheelY = y + 18;
        this.drawTrainWheel(ctx, x - 15, wheelY, 14);
        this.drawTrainWheel(ctx, x + 10, wheelY, 14);
        this.drawTrainWheel(ctx, x + 35, wheelY, 14);
        
        // Connecting rod
        ctx.strokeStyle = '#4a4a4a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 15, wheelY);
        ctx.lineTo(x + 35, wheelY);
        ctx.stroke();
        
        // Cowcatcher/buffer
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.moveTo(x + 45, y + 18);
        ctx.lineTo(x + 58, y + 22);
        ctx.lineTo(x + 58, y + 5);
        ctx.lineTo(x + 45, y - 5);
        ctx.closePath();
        ctx.fill();
        
        // Buffer beam
        ctx.fillStyle = isEnemy ? '#5a3525' : '#355a45';
        ctx.fillRect(x + 42, y + 2, 5, 14);
    }
    
    drawTrainWheel(ctx, x, y, radius) {
        // Outer rim
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner wheel
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Spokes
        ctx.strokeStyle = '#4a4a4a';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * (radius - 3), y + Math.sin(angle) * (radius - 3));
            ctx.stroke();
        }
        
        // Hub
        ctx.fillStyle = '#5a5a5a';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a4a4a';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    renderWagon(ctx, x, y, team) {
        const isEnemy = team === CONFIG.TEAM_ENEMY;
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(x + 5, y + 22, 30, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Wagon body - boxcar style
        const bodyColor = isEnemy ? '#4a3525' : '#354a35';
        const trimColor = isEnemy ? '#5a4535' : '#455a45';
        
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x - 22, y - 18, 54, 32);
        
        // Darker bottom
        ctx.fillStyle = '#2a2a1a';
        ctx.fillRect(x - 22, y + 8, 54, 6);
        
        // Planks texture - vertical
        ctx.strokeStyle = trimColor;
        ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) {
            ctx.beginPath();
            ctx.moveTo(x - 18 + i * 8, y - 16);
            ctx.lineTo(x - 18 + i * 8, y + 6);
            ctx.stroke();
        }
        
        // Horizontal trim
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(x - 24, y - 20, 58, 3);
        ctx.fillRect(x - 24, y + 5, 58, 3);
        
        // Door (center)
        ctx.fillStyle = '#2a2a1a';
        ctx.fillRect(x - 8, y - 14, 16, 18);
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 8, y - 14, 16, 18);
        
        // Door handle
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(x + 4, y - 4, 3, 6);
        
        // Roof
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 20);
        ctx.lineTo(x - 20, y - 26);
        ctx.lineTo(x + 30, y - 26);
        ctx.lineTo(x + 34, y - 20);
        ctx.closePath();
        ctx.fill();
        
        // Wheels
        this.drawTrainWheel(ctx, x - 10, y + 18, 10);
        this.drawTrainWheel(ctx, x + 20, y + 18, 10);
        
        // Coupling
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(x + 30, y + 2, 10, 5);
    }
    
    renderSteam(ctx, train) {
        const time = performance.now() / 1000;
        
        // WWI era darker, dirtier smoke
        for (let i = 0; i < 6; i++) {
            const offset = (time * 60 + i * 25) % 120;
            const size = 10 + offset * 0.4;
            const alpha = 0.7 - offset / 180;
            
            // Darker smoke
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.fillStyle = `rgb(${60 - offset/3}, ${55 - offset/3}, ${45 - offset/3})`;
            
            const swirl = Math.sin(time * 2 + i * 0.8) * 8;
            ctx.beginPath();
            ctx.arc(28 + swirl, -55 - offset + Math.sin(time * 3 + i) * 4, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Occasional spark
        if (Math.sin(time * 10) > 0.9) {
            ctx.fillStyle = '#ffaa44';
            ctx.globalAlpha = 0.8;
            ctx.fillRect(28 + Math.random() * 10, -60 - Math.random() * 20, 2, 2);
        }
        
        ctx.globalAlpha = 1;
    }
}

