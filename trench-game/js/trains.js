// Trains Module - Train logistics and reinforcement system
import { CONFIG } from './game.js';

export class TrainSystem {
    constructor(game) {
        this.game = game;
        this.trains = [];
        this.trainIdCounter = 0;
        
        // Timer for player trains
        this.playerTrainTimer = 0;
        this.enemyTrainTimer = 0;
        
        // Train interval can vary
        this.playerInterval = CONFIG.TRAIN_INTERVAL;
        this.enemyInterval = CONFIG.TRAIN_INTERVAL * 1.2; // Enemy slightly slower
    }
    
    start() {
        // Schedule first trains
        this.playerTrainTimer = this.playerInterval / 2; // First train halfway
        this.enemyTrainTimer = this.enemyInterval / 2;
    }
    
    update(dt) {
        // Update timers
        this.playerTrainTimer -= dt * 1000;
        this.enemyTrainTimer -= dt * 1000;
        
        // Spawn player train
        if (this.playerTrainTimer <= 0) {
            this.spawnTrain(CONFIG.TEAM_PLAYER);
            this.playerTrainTimer = this.playerInterval;
        }
        
        // Spawn enemy train
        if (this.enemyTrainTimer <= 0) {
            this.spawnTrain(CONFIG.TEAM_ENEMY);
            this.enemyTrainTimer = this.enemyInterval;
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
        
        // Update UI timer
        const timeLeft = Math.ceil(this.playerTrainTimer / 1000);
        document.getElementById('train-timer').textContent = `Next train: ${timeLeft}s`;
    }
    
    spawnTrain(team) {
        const isPlayer = team === CONFIG.TEAM_PLAYER;
        
        const train = {
            id: this.trainIdCounter++,
            team,
            x: isPlayer ? -200 : CONFIG.MAP_WIDTH + 200,
            y: CONFIG.MAP_HEIGHT / 2,
            targetX: isPlayer ? 50 : CONFIG.MAP_WIDTH - 50,
            speed: 150,
            state: 'arriving', // arriving, stopped, departing, departed
            stopTime: 0,
            maxStopTime: 3, // Seconds to unload
            soldiers: CONFIG.SOLDIERS_PER_TRAIN,
            workers: CONFIG.WORKERS_PER_TRAIN,
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
        
        // Main body
        ctx.fillStyle = isEnemy ? '#4a3020' : '#2a4a30';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        
        ctx.fillRect(x - 30, y - 25, 70, 40);
        ctx.strokeRect(x - 30, y - 25, 70, 40);
        
        // Cabin
        ctx.fillStyle = isEnemy ? '#5a4030' : '#3a5a40';
        ctx.fillRect(x - 30, y - 40, 35, 20);
        ctx.strokeRect(x - 30, y - 40, 35, 20);
        
        // Window
        ctx.fillStyle = '#8af';
        ctx.fillRect(x - 25, y - 35, 12, 10);
        
        // Smokestack
        ctx.fillStyle = '#333';
        ctx.fillRect(x + 20, y - 45, 12, 25);
        
        // Stack top
        ctx.fillRect(x + 17, y - 50, 18, 8);
        
        // Boiler details
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(x + i * 12, y - 5, 3, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Wheels
        ctx.fillStyle = '#333';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        
        const wheelY = y + 15;
        const wheelRadius = 12;
        
        for (const wx of [x - 15, x + 10, x + 30]) {
            ctx.beginPath();
            ctx.arc(wx, wheelY, wheelRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Wheel details
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.arc(wx, wheelY, 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#333';
        }
        
        // Cowcatcher
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.moveTo(x + 40, y + 15);
        ctx.lineTo(x + 55, y + 20);
        ctx.lineTo(x + 55, y + 5);
        ctx.lineTo(x + 40, y - 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    
    renderWagon(ctx, x, y, team) {
        const isEnemy = team === CONFIG.TEAM_ENEMY;
        
        // Wagon body
        ctx.fillStyle = isEnemy ? '#5a4535' : '#455a45';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        
        ctx.fillRect(x - 20, y - 20, 50, 35);
        ctx.strokeRect(x - 20, y - 20, 50, 35);
        
        // Planks texture
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x - 20, y - 15 + i * 10);
            ctx.lineTo(x + 30, y - 15 + i * 10);
            ctx.stroke();
        }
        
        // Wheels
        ctx.fillStyle = '#333';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        
        const wheelY = y + 15;
        const wheelRadius = 8;
        
        for (const wx of [x - 10, x + 20]) {
            ctx.beginPath();
            ctx.arc(wx, wheelY, wheelRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        
        // Coupling
        ctx.fillStyle = '#555';
        ctx.fillRect(x + 28, y, 8, 4);
    }
    
    renderSteam(ctx, train) {
        const time = performance.now() / 1000;
        
        ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
        
        for (let i = 0; i < 5; i++) {
            const offset = (time * 50 + i * 20) % 100;
            const size = 8 + offset * 0.3;
            const alpha = 0.6 - offset / 200;
            
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.beginPath();
            ctx.arc(25, -50 - offset + Math.sin(time * 3 + i) * 5, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.globalAlpha = 1;
    }
}

