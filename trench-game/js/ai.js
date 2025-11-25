// AI Controller - Enemy AI behavior
import { CONFIG } from './game.js';
import { UnitState } from './units.js';

export class AIController {
    constructor(game) {
        this.game = game;
        this.team = CONFIG.TEAM_ENEMY;
        
        // AI timing
        this.thinkTimer = 0;
        this.thinkInterval = 2;
        
        // AI state
        this.phase = 'defend';
        this.attackTimer = 0;
        this.attackInterval = 45;
        
        // Build timers
        this.buildTimer = 0;
        this.buildInterval = 15; // Check for new builds every 15 seconds
        
        // Track threats
        this.threatLevel = 0;
    }
    
    initialize() {
        // Create initial defensive trenches for enemy (pre-built)
        this.createInitialDefenses();
        
        // Auto-assign initial soldiers to trenches after a short delay
        setTimeout(() => {
            this.assignSoldiersToTrenches();
            this.assignSoldiersToEmplacements();
        }, 500);
    }
    
    createInitialDefenses() {
        // Main trench line (pre-built, not blueprint)
        const trenchPoints1 = [];
        const baseX = CONFIG.MAP_WIDTH - 350;
        
        for (let i = 0; i <= 10; i++) {
            const y = 150 + i * (CONFIG.MAP_HEIGHT - 300) / 10;
            const xOffset = Math.sin(i * 0.5) * 30;
            trenchPoints1.push({ x: baseX + xOffset, y });
        }
        
        const trench1 = this.game.trenchSystem.createTrench(trenchPoints1, this.team, false);
        this.game.trenchSystem.completeTrench(trench1);
        
        // Communication trenches (pre-built)
        const commTrench1 = [
            { x: baseX, y: CONFIG.MAP_HEIGHT * 0.3 },
            { x: CONFIG.MAP_WIDTH - 200, y: CONFIG.MAP_HEIGHT * 0.3 }
        ];
        
        const commTrench2 = [
            { x: baseX, y: CONFIG.MAP_HEIGHT * 0.7 },
            { x: CONFIG.MAP_WIDTH - 200, y: CONFIG.MAP_HEIGHT * 0.7 }
        ];
        
        const ct1 = this.game.trenchSystem.createTrench(commTrench1, this.team, false);
        const ct2 = this.game.trenchSystem.createTrench(commTrench2, this.team, false);
        this.game.trenchSystem.completeTrench(ct1);
        this.game.trenchSystem.completeTrench(ct2);
        
        // Place machine guns (pre-built and manned)
        setTimeout(() => {
            // Create as non-blueprint so they work immediately
            const mg1 = this.game.buildingManager.createBuilding('machinegun', baseX, CONFIG.MAP_HEIGHT * 0.25, this.team, false);
            const mg2 = this.game.buildingManager.createBuilding('machinegun', baseX, CONFIG.MAP_HEIGHT * 0.5, this.team, false);
            const mg3 = this.game.buildingManager.createBuilding('machinegun', baseX, CONFIG.MAP_HEIGHT * 0.75, this.team, false);
        }, 100);
        
        // Place artillery (pre-built)
        setTimeout(() => {
            this.game.buildingManager.createBuilding('artillery', CONFIG.MAP_WIDTH - 150, CONFIG.MAP_HEIGHT * 0.4, this.team, false);
            this.game.buildingManager.createBuilding('artillery', CONFIG.MAP_WIDTH - 150, CONFIG.MAP_HEIGHT * 0.6, this.team, false);
        }, 200);
    }
    
    assignSoldiersToTrenches() {
        const soldiers = this.game.unitManager.units.filter(
            u => u.team === this.team && 
                 u.type === 'soldier' && 
                 u.state !== UnitState.DEAD &&
                 !u.mannedBuilding
        );
        
        for (const soldier of soldiers) {
            const pos = this.game.trenchSystem.findUnoccupiedTrenchPosition(
                soldier.x, soldier.y, this.team, soldier
            );
            if (pos) {
                soldier.orderToTrench(pos.x, pos.y, pos.trench);
            }
        }
    }
    
    assignSoldiersToEmplacements() {
        // Find unmanned emplacements
        let unmanned = this.game.buildingManager.getUnmannedEmplacement(this.team);
        
        while (unmanned) {
            // Find an idle soldier
            const soldier = this.game.unitManager.units.find(
                u => u.team === this.team && 
                     u.type === 'soldier' && 
                     (u.state === UnitState.IDLE || u.state === UnitState.MOVING) &&
                     !u.mannedBuilding
            );
            
            if (soldier) {
                soldier.assignToEmplacement(unmanned);
            } else {
                break; // No available soldiers
            }
            
            unmanned = this.game.buildingManager.getUnmannedEmplacement(this.team);
        }
    }
    
    update(dt) {
        this.thinkTimer += dt;
        this.attackTimer += dt;
        this.buildTimer += dt;
        
        // Periodic thinking
        if (this.thinkTimer >= this.thinkInterval) {
            this.thinkTimer = 0;
            this.think();
        }
        
        // Periodic attacks
        if (this.attackTimer >= this.attackInterval) {
            this.attackTimer = 0;
            this.launchAttack();
        }
        
        // Periodic building
        if (this.buildTimer >= this.buildInterval) {
            this.buildTimer = 0;
            this.considerBuilding();
        }
        
        // Update individual unit AI
        this.updateUnits(dt);
    }
    
    think() {
        this.assessThreat();
        
        if (this.threatLevel > 50) {
            this.phase = 'defend';
        } else if (this.getIdleSoldiers().length > 15) {
            this.phase = 'attack';
        } else {
            this.phase = 'buildup';
        }
        
        switch (this.phase) {
            case 'defend':
                this.executeDefend();
                break;
            case 'buildup':
                this.executeBuildup();
                break;
        }
        
        // Always try to man emplacements
        this.assignSoldiersToEmplacements();
    }
    
    assessThreat() {
        const playerUnits = this.game.unitManager.units.filter(
            u => u.team === CONFIG.TEAM_PLAYER && u.state !== UnitState.DEAD
        );
        
        let threat = 0;
        
        for (const unit of playerUnits) {
            if (unit.x > CONFIG.MAP_WIDTH * 0.5) {
                threat += 10;
                if (unit.state === UnitState.CHARGING) {
                    threat += 20;
                }
            }
        }
        
        for (const building of this.game.buildingManager.buildings) {
            if (building.team === CONFIG.TEAM_PLAYER && !building.destroyed) {
                if (building.type === 'artillery') {
                    threat += 15;
                }
            }
        }
        
        this.threatLevel = threat;
    }
    
    getIdleSoldiers() {
        return this.game.unitManager.units.filter(
            u => u.team === this.team && 
                 u.type === 'soldier' && 
                 u.state === UnitState.IDLE &&
                 !u.mannedBuilding
        );
    }
    
    getIdleWorkers() {
        return this.game.unitManager.units.filter(
            u => u.team === this.team && 
                 u.type === 'worker' && 
                 u.state === UnitState.IDLE &&
                 !u.task
        );
    }
    
    executeDefend() {
        const idleSoldiers = this.getIdleSoldiers();
        
        for (const soldier of idleSoldiers) {
            if (!this.game.trenchSystem.isInTrench(soldier.x, soldier.y, this.team)) {
                const pos = this.game.trenchSystem.findUnoccupiedTrenchPosition(
                    soldier.x, soldier.y, this.team, soldier
                );
                if (pos) {
                    soldier.orderToTrench(pos.x, pos.y, pos.trench);
                }
            }
        }
    }
    
    executeBuildup() {
        // Workers will automatically find build tasks, but we can queue new ones
        const idleWorkers = this.getIdleWorkers();
        
        if (idleWorkers.length > 0) {
            // Workers should auto-find tasks, but let's help them
            for (const worker of idleWorkers) {
                // Check for trench build sites
                const trenchSite = this.game.trenchSystem.findNearestBuildSite(worker.x, worker.y, this.team);
                if (trenchSite) {
                    worker.assignTask({
                        type: 'build_trench',
                        trench: trenchSite.trench,
                        segmentIndex: trenchSite.segmentIndex,
                        buildSite: trenchSite
                    });
                    worker.targetX = trenchSite.x;
                    worker.targetY = trenchSite.y;
                    worker.setState(UnitState.MOVING);
                    continue;
                }
                
                // Check for building sites
                const buildSite = this.game.buildingManager.findNearestBuildSite(worker.x, worker.y, this.team);
                if (buildSite) {
                    if (buildSite.type === 'building') {
                        worker.assignTask({
                            type: 'build_emplacement',
                            building: buildSite.building
                        });
                    } else if (buildSite.type === 'wire') {
                        worker.assignTask({
                            type: 'build_wire',
                            wire: buildSite.wire,
                            segmentIndex: buildSite.segmentIndex
                        });
                    }
                    worker.targetX = buildSite.x;
                    worker.targetY = buildSite.y;
                    worker.setState(UnitState.MOVING);
                }
            }
        }
    }
    
    considerBuilding() {
        const idleWorkers = this.getIdleWorkers();
        if (idleWorkers.length === 0) return;
        
        // Count current defenses
        const myTrenches = this.game.trenchSystem.trenches.filter(t => t.team === this.team);
        const myMGs = this.game.buildingManager.buildings.filter(
            b => b.team === this.team && b.type === 'machinegun' && !b.destroyed
        );
        const myArtillery = this.game.buildingManager.buildings.filter(
            b => b.team === this.team && b.type === 'artillery' && !b.destroyed
        );
        
        // Randomly decide what to build
        const roll = Math.random();
        
        if (roll < 0.4 && myTrenches.length < 6) {
            // Build new trench
            this.buildNewTrench();
        } else if (roll < 0.7 && myMGs.length < 5) {
            // Build new MG
            this.buildNewMachineGun();
        } else if (myArtillery.length < 3) {
            // Build artillery
            this.buildNewArtillery();
        }
    }
    
    buildNewTrench() {
        const baseX = CONFIG.MAP_WIDTH - 400 - Math.random() * 150;
        const y1 = 150 + Math.random() * (CONFIG.MAP_HEIGHT - 300);
        const y2 = y1 + 80 + Math.random() * 120;
        
        const points = [
            { x: baseX, y: y1 },
            { x: baseX - 20 + Math.random() * 40, y: (y1 + y2) / 2 },
            { x: baseX, y: y2 }
        ];
        
        this.game.trenchSystem.createTrench(points, this.team, true);
    }
    
    buildNewMachineGun() {
        // Place near existing trenches
        const trenches = this.game.trenchSystem.trenches.filter(
            t => t.team === this.team && !t.isBlueprint
        );
        
        if (trenches.length === 0) return;
        
        const trench = trenches[Math.floor(Math.random() * trenches.length)];
        const point = trench.points[Math.floor(Math.random() * trench.points.length)];
        
        if (this.game.buildingManager.canPlace('machinegun', point.x, point.y)) {
            this.game.buildingManager.createBuilding('machinegun', point.x, point.y, this.team, true);
        }
    }
    
    buildNewArtillery() {
        const x = CONFIG.MAP_WIDTH - 100 - Math.random() * 100;
        const y = 200 + Math.random() * (CONFIG.MAP_HEIGHT - 400);
        
        if (this.game.buildingManager.canPlace('artillery', x, y)) {
            this.game.buildingManager.createBuilding('artillery', x, y, this.team, true);
        }
    }
    
    launchAttack() {
        const soldiers = this.getIdleSoldiers();
        
        if (soldiers.length < 5) return;
        
        const attackForce = soldiers.slice(0, Math.floor(soldiers.length * 0.6));
        
        for (const soldier of attackForce) {
            soldier.setState(UnitState.CHARGING);
        }
    }
    
    updateUnits(dt) {
        const units = this.game.unitManager.units.filter(u => u.team === this.team);
        
        for (const unit of units) {
            if (unit.state === UnitState.DEAD) continue;
            
            // Soldiers in combat should fight
            if (unit.type === 'soldier' && unit.state === UnitState.IDLE && !unit.mannedBuilding) {
                const enemies = this.game.unitManager.getEnemiesInRange(
                    unit.x, unit.y, unit.attackRange, this.team
                );
                
                // Also check for enemy buildings (artillery, machine guns) in range
                const enemyBuildings = this.game.buildingManager.buildings.filter(b => 
                    b.team === CONFIG.TEAM_PLAYER && 
                    !b.destroyed && 
                    !b.isBlueprint &&
                    b.type !== 'hq' &&
                    Math.sqrt((b.x - unit.x) ** 2 + (b.y - unit.y) ** 2) <= unit.attackRange
                );
                
                // Find the best target (units or buildings)
                let best = null;
                let bestScore = -Infinity;
                
                for (const enemy of enemies) {
                    const dist = Math.sqrt(
                        (enemy.x - unit.x) ** 2 + (enemy.y - unit.y) ** 2
                    );
                    const score = -dist + (enemy.state === UnitState.CHARGING ? 100 : 0);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        best = enemy;
                    }
                }
                
                // Buildings are valid targets too - prioritize manned ones
                for (const building of enemyBuildings) {
                    const dist = Math.sqrt(
                        (building.x - unit.x) ** 2 + (building.y - unit.y) ** 2
                    );
                    // Prioritize manned buildings (they're shooting at us!)
                    const mannedBonus = building.assignedUnit ? 50 : 0;
                    const score = -dist + mannedBonus;
                    
                    if (score > bestScore) {
                        bestScore = score;
                        best = building;
                    }
                }
                
                if (best) {
                    unit.attackTarget = best;
                    unit.setState(UnitState.FIGHTING);
                }
            }
            
            // Retreating units recover
            if (unit.state === UnitState.RETREATING) {
                if (unit.x > CONFIG.MAP_WIDTH - 200) {
                    // MORALE SYSTEM - SHELVED FOR NOW (see README)
                    // unit.morale = Math.min(100, unit.morale + 30);
                    unit.setState(UnitState.IDLE);
                }
            }
        }
    }
}
