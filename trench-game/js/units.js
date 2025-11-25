// Units Module - Soldiers, workers, and their behaviors
import { CONFIG } from './game.js';

// Unit states
export const UnitState = {
    IDLE: 'idle',
    MOVING: 'moving',
    WORKING: 'working',
    FIGHTING: 'fighting',
    CHARGING: 'charging',
    RETREATING: 'retreating',
    DEAD: 'dead'
};

export class UnitManager {
    constructor(game) {
        this.game = game;
        this.units = [];
        this.unitIdCounter = 0;
    }
    
    clear() {
        this.units = [];
    }
    
    spawnUnit(type, x, y, team) {
        const unit = new Unit(this.game, {
            id: this.unitIdCounter++,
            type,
            x,
            y,
            team
        });
        
        this.units.push(unit);
        return unit;
    }
    
    update(dt) {
        for (let i = this.units.length - 1; i >= 0; i--) {
            const unit = this.units[i];
            unit.update(dt);
            
            // Remove dead units after death animation
            if (unit.state === UnitState.DEAD && unit.deathTime > 2) {
                this.units.splice(i, 1);
                
                // Update selection if unit was selected
                const selIdx = this.game.selectedUnits.indexOf(unit);
                if (selIdx !== -1) {
                    this.game.selectedUnits.splice(selIdx, 1);
                    this.game.ui.updateSelection(this.game.selectedUnits);
                }
            }
        }
    }
    
    getUnitAt(x, y) {
        for (const unit of this.units) {
            if (unit.state === UnitState.DEAD) continue;
            
            const dist = Math.sqrt((unit.x - x) ** 2 + (unit.y - y) ** 2);
            if (dist < unit.radius) {
                return unit;
            }
        }
        return null;
    }
    
    getUnitsInBox(x1, y1, x2, y2) {
        return this.units.filter(unit => {
            if (unit.state === UnitState.DEAD) return false;
            return unit.x >= x1 && unit.x <= x2 && unit.y >= y1 && unit.y <= y2;
        });
    }
    
    getUnitsInRange(x, y, range, team = null) {
        return this.units.filter(unit => {
            if (unit.state === UnitState.DEAD) return false;
            if (team !== null && unit.team !== team) return false;
            
            const dist = Math.sqrt((unit.x - x) ** 2 + (unit.y - y) ** 2);
            return dist <= range;
        });
    }
    
    getEnemiesInRange(x, y, range, myTeam) {
        return this.units.filter(unit => {
            if (unit.state === UnitState.DEAD) return false;
            if (unit.team === myTeam) return false;
            
            const dist = Math.sqrt((unit.x - x) ** 2 + (unit.y - y) ** 2);
            return dist <= range;
        });
    }
    
    autoAssignSoldier(soldier) {
        // First check for unmanned emplacements
        const unmanned = this.game.buildingManager.getUnmannedEmplacement(soldier.team);
        if (unmanned) {
            soldier.assignToEmplacement(unmanned);
            return;
        }
        
        // Find an unoccupied trench position (spreads soldiers out)
        const trenchPos = this.game.trenchSystem.findUnoccupiedTrenchPosition(
            soldier.x, soldier.y, soldier.team, soldier
        );
        if (trenchPos) {
            soldier.orderToTrench(trenchPos.x, trenchPos.y, trenchPos.trench);
        }
    }
    
    reassignIdleSoldiers(team) {
        // Called when a new emplacement is built
        const idle = this.units.filter(u => 
            u.team === team && 
            u.type === 'soldier' && 
            u.state === UnitState.IDLE &&
            !u.mannedBuilding
        );
        
        for (const soldier of idle) {
            const unmanned = this.game.buildingManager.getUnmannedEmplacement(team);
            if (unmanned) {
                soldier.assignToEmplacement(unmanned);
            } else {
                break; // No more unmanned emplacements
            }
        }
    }
    
    render(ctx) {
        // Sort by Y for depth
        const sortedUnits = [...this.units].sort((a, b) => a.y - b.y);
        
        for (const unit of sortedUnits) {
            unit.render(ctx);
        }
    }
}

class Unit {
    constructor(game, config) {
        this.game = game;
        this.id = config.id;
        this.type = config.type;
        this.x = config.x;
        this.y = config.y;
        this.team = config.team;
        
        // Stats based on type
        this.setupStats();
        
        // State
        this.state = UnitState.IDLE;
        this.selected = false;
        this.target = null;
        this.attackTarget = null;
        this.task = null;
        this.mannedBuilding = null;
        this.assignedTrench = null;
        
        // Movement
        this.targetX = this.x;
        this.targetY = this.y;
        this.velocity = { x: 0, y: 0 };
        this.facing = config.team === CONFIG.TEAM_PLAYER ? 1 : -1; // 1 = right, -1 = left
        
        // Combat
        this.attackCooldown = 0;
        this.lastShotTime = 0;
        
        // Animation
        this.animTime = Math.random() * 10; // Offset for variety
        this.deathTime = 0;
        
        // Morale
        this.morale = 100;
        this.suppression = 0;
    }
    
    setupStats() {
        if (this.type === 'soldier') {
            this.maxHealth = 100;
            this.health = 100;
            this.speed = 70;          // Faster like Cannon Fodder
            this.radius = 6;          // Tiny units!
            this.attackRange = CONFIG.RIFLE_RANGE;
            this.attackDamage = 25;
            this.attackRate = 1.5;
        } else if (this.type === 'worker') {
            this.maxHealth = 60;
            this.health = 60;
            this.speed = 55;
            this.radius = 5;          // Even tinier
            this.attackRange = 0;
            this.attackDamage = 0;
            this.attackRate = 0;
            this.buildSpeed = 30;
        }
    }
    
    setState(state) {
        this.state = state;
        
        if (state === UnitState.CHARGING) {
            this.speed = 100; // Faster when charging
            this.morale = Math.min(100, this.morale + 20);
        } else if (state === UnitState.RETREATING) {
            this.speed = 80;
        } else {
            this.speed = this.type === 'soldier' ? 60 : 50;
        }
    }
    
    moveTo(x, y) {
        this.targetX = x;
        this.targetY = y;
        this.setState(UnitState.MOVING);
    }
    
    attackTargetUnit(target) {
        this.attackTarget = target;
        this.setState(UnitState.FIGHTING);
    }
    
    orderToTrench(x, y, trench) {
        this.targetX = x;
        this.targetY = y;
        this.assignedTrench = trench;
        this.mannedBuilding = null;
        this.setState(UnitState.MOVING);
        // Will become IDLE when reaching trench, then auto-fight from there
    }
    
    assignToEmplacement(building) {
        // Go man this emplacement
        this.targetX = building.x;
        this.targetY = building.y;
        this.mannedBuilding = building;
        building.assignedUnit = this;
        this.setState(UnitState.MOVING);
    }
    
    leaveEmplacement() {
        if (this.mannedBuilding) {
            this.mannedBuilding.assignedUnit = null;
            this.mannedBuilding = null;
        }
    }
    
    assignTask(task) {
        this.task = task;
        
        if (task.type === 'build_trench') {
            const buildSite = this.game.trenchSystem.findNearestBuildSite(this.x, this.y, this.team);
            if (buildSite) {
                this.targetX = buildSite.x;
                this.targetY = buildSite.y;
                this.task.buildSite = buildSite;
                this.setState(UnitState.MOVING);
            }
        }
    }
    
    update(dt) {
        if (this.state === UnitState.DEAD) {
            this.deathTime += dt;
            return;
        }
        
        this.animTime += dt;
        
        // Update cooldowns
        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }
        
        // Reduce suppression over time
        if (this.suppression > 0) {
            this.suppression = Math.max(0, this.suppression - dt * 20);
        }
        
        // Apply separation from nearby friendly units
        this.applySeparation(dt);
        
        // State machine
        switch (this.state) {
            case UnitState.IDLE:
                this.updateIdle(dt);
                break;
            case UnitState.MOVING:
                this.updateMoving(dt);
                break;
            case UnitState.WORKING:
                this.updateWorking(dt);
                break;
            case UnitState.FIGHTING:
                this.updateFighting(dt);
                break;
            case UnitState.CHARGING:
                this.updateCharging(dt);
                break;
            case UnitState.RETREATING:
                this.updateMoving(dt);
                break;
        }
    }
    
    applySeparation(dt) {
        // Don't apply separation to workers who are building or manning a position
        if (this.mannedBuilding || this.state === UnitState.WORKING) {
            return;
        }
        
        const minDistance = 12; // Minimum spacing between units
        const separationForce = 80; // How strongly they push apart
        
        // Get nearby friendly units (exclude workers who are working)
        const nearby = this.game.unitManager.units.filter(u => 
            u !== this && 
            u.state !== UnitState.DEAD &&
            u.state !== UnitState.WORKING &&
            u.team === this.team
        );
        
        let pushX = 0;
        let pushY = 0;
        
        for (const other of nearby) {
            const dx = this.x - other.x;
            const dy = this.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < minDistance && dist > 0.1) {
                // Push away from this unit
                const overlap = minDistance - dist;
                const force = (overlap / minDistance) * separationForce;
                
                pushX += (dx / dist) * force;
                pushY += (dy / dist) * force;
            } else if (dist < 0.1) {
                // Units exactly on top of each other - random push
                pushX += (Math.random() - 0.5) * separationForce;
                pushY += (Math.random() - 0.5) * separationForce;
            }
        }
        
        // Apply push
        if (pushX !== 0 || pushY !== 0) {
            this.x += pushX * dt;
            this.y += pushY * dt;
            
            // Keep in bounds
            this.x = Math.max(20, Math.min(CONFIG.MAP_WIDTH - 20, this.x));
            this.y = Math.max(20, Math.min(CONFIG.MAP_HEIGHT - 20, this.y));
        }
    }
    
    updateIdle(dt) {
        // Soldiers: Look for enemies in range or man positions
        if (this.type === 'soldier') {
            // If manning an emplacement, stay there and look for enemies
            if (this.mannedBuilding) {
                // Stay at building position
                this.x = this.mannedBuilding.x;
                this.y = this.mannedBuilding.y;
            }
            
            const enemies = this.game.unitManager.getEnemiesInRange(
                this.x, this.y, this.attackRange, this.team
            );
            
            if (enemies.length > 0) {
                const nearest = this.findNearest(enemies);
                if (nearest) {
                    this.attackTarget = nearest;
                    this.setState(UnitState.FIGHTING);
                }
            }
        }
        
        // Workers: Look for build tasks
        if (this.type === 'worker' && !this.task) {
            // First check for trench building (pass worker ID to respect claims)
            let buildSite = this.game.trenchSystem.findNearestBuildSite(this.x, this.y, this.team, this.id);
            
            if (buildSite) {
                this.assignTask({
                    type: 'build_trench',
                    trench: buildSite.trench,
                    segmentIndex: buildSite.segmentIndex,
                    buildSite
                });
                // Claim this segment
                this.game.trenchSystem.claimSegment(buildSite.trench.id, buildSite.segmentIndex, this.id);
                this.targetX = buildSite.x;
                this.targetY = buildSite.y;
                this.setState(UnitState.MOVING);
                return;
            }
            
            // Then check for emplacement/wire building (pass worker ID to respect claims)
            buildSite = this.game.buildingManager.findNearestBuildSite(this.x, this.y, this.team, this.id);
            
            if (buildSite) {
                if (buildSite.type === 'building') {
                    this.assignTask({
                        type: 'build_emplacement',
                        building: buildSite.building
                    });
                    // Claim this building
                    this.game.buildingManager.claimBuilding(buildSite.building.id, this.id);
                    this.targetX = buildSite.x;
                    this.targetY = buildSite.y;
                    this.setState(UnitState.MOVING);
                } else if (buildSite.type === 'wire') {
                    this.assignTask({
                        type: 'build_wire',
                        wire: buildSite.wire,
                        segmentIndex: buildSite.segmentIndex
                    });
                    // Claim this wire segment
                    this.game.buildingManager.claimWireSegment(buildSite.wire.id, buildSite.segmentIndex, this.id);
                    this.targetX = buildSite.x;
                    this.targetY = buildSite.y;
                    this.setState(UnitState.MOVING);
                }
            }
        }
    }
    
    updateMoving(dt) {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Workers need to be close to build, but not exactly on target
        const arrivalDist = (this.type === 'worker' && this.task) ? 15 : 5;
        
        if (dist < arrivalDist) {
            // Arrived (don't snap exactly to target for workers - let them work from nearby)
            if (this.type !== 'worker') {
                this.x = this.targetX;
                this.y = this.targetY;
            }
            
            if (this.task) {
                // Verify the task is still valid before starting work
                if (this.task.type === 'build_emplacement') {
                    if (this.task.building.destroyed || !this.task.building.isBlueprint) {
                        this.clearTask();
                        this.setState(UnitState.IDLE);
                        return;
                    }
                }
                if (this.task.type === 'build_wire') {
                    if (this.task.wire.destroyed || !this.task.wire.isBlueprint) {
                        this.clearTask();
                        this.setState(UnitState.IDLE);
                        return;
                    }
                }
                if (this.task.type === 'build_trench') {
                    if (!this.task.trench.isBlueprint) {
                        this.clearTask();
                        this.setState(UnitState.IDLE);
                        return;
                    }
                }
                
                if (this.task.type === 'build_trench' || 
                    this.task.type === 'build_emplacement' || 
                    this.task.type === 'build_wire') {
                    this.setState(UnitState.WORKING);
                    return;
                }
            }
            
            if (this.state === UnitState.RETREATING) {
                this.setState(UnitState.IDLE);
            } else {
                this.setState(UnitState.IDLE);
            }
            return;
        }
        
        // Move toward target
        const moveSpeed = this.speed * (1 - this.suppression / 200);
        const vx = (dx / dist) * moveSpeed;
        const vy = (dy / dist) * moveSpeed;
        
        this.x += vx * dt;
        this.y += vy * dt;
        
        // Update facing
        if (Math.abs(vx) > 0.1) {
            this.facing = vx > 0 ? 1 : -1;
        }
        
        // Clamp to map
        this.x = Math.max(20, Math.min(CONFIG.MAP_WIDTH - 20, this.x));
        this.y = Math.max(20, Math.min(CONFIG.MAP_HEIGHT - 20, this.y));
    }
    
    updateWorking(dt) {
        if (!this.task) {
            this.setState(UnitState.IDLE);
            return;
        }
        
        // Safety check - verify task target still exists and needs building
        if (this.task.type === 'build_emplacement') {
            if (!this.task.building || this.task.building.destroyed || !this.task.building.isBlueprint) {
                this.clearTask();
                this.setState(UnitState.IDLE);
                return;
            }
        } else if (this.task.type === 'build_wire') {
            if (!this.task.wire || this.task.wire.destroyed || !this.task.wire.isBlueprint) {
                this.clearTask();
                this.setState(UnitState.IDLE);
                return;
            }
        } else if (this.task.type === 'build_trench') {
            if (!this.task.trench || !this.task.trench.isBlueprint) {
                this.clearTask();
                this.setState(UnitState.IDLE);
                return;
            }
        }
        
        // Create dirt effect
        if (Math.random() < dt * 5) {
            this.game.addEffect('dirt', this.x + (Math.random() - 0.5) * 20, this.y, {
                size: 8 + Math.random() * 8,
                duration: 0.5
            });
        }
        
        if (this.task.type === 'build_trench') {
            const trench = this.task.trench;
            const segIdx = this.task.segmentIndex;
            
            const completed = this.game.trenchSystem.buildSegment(trench, segIdx, this.buildSpeed * dt);
            
            if (completed) {
                // Unclaim the completed segment
                this.game.trenchSystem.unclaimSegment(trench.id, segIdx);
                
                if (this.game.trenchSystem.isTrenchComplete(trench)) {
                    this.game.trenchSystem.completeTrench(trench);
                    this.clearTask();
                    this.setState(UnitState.IDLE);
                } else {
                    const nextBuildSite = this.game.trenchSystem.findNearestBuildSite(this.x, this.y, this.team, this.id);
                    if (nextBuildSite && nextBuildSite.trench === trench) {
                        this.targetX = nextBuildSite.x;
                        this.targetY = nextBuildSite.y;
                        this.task.buildSite = nextBuildSite;
                        this.task.segmentIndex = nextBuildSite.segmentIndex;
                        // Claim the new segment
                        this.game.trenchSystem.claimSegment(trench.id, nextBuildSite.segmentIndex, this.id);
                        this.setState(UnitState.MOVING);
                    } else {
                        this.clearTask();
                        this.setState(UnitState.IDLE);
                    }
                }
            }
        } else if (this.task.type === 'build_emplacement') {
            const building = this.task.building;
            
            if (building.destroyed) {
                this.clearTask();
                this.setState(UnitState.IDLE);
                return;
            }
            
            const completed = this.game.buildingManager.buildBuilding(building, this.buildSpeed * dt);
            
            if (completed) {
                // Unclaim the building
                this.game.buildingManager.unclaimBuilding(building.id);
                this.clearTask();
                this.setState(UnitState.IDLE);
            }
        } else if (this.task.type === 'build_wire') {
            const wire = this.task.wire;
            const segIdx = this.task.segmentIndex;
            
            if (wire.destroyed) {
                this.clearTask();
                this.setState(UnitState.IDLE);
                return;
            }
            
            const completed = this.game.buildingManager.buildWireSegment(wire, segIdx, this.buildSpeed * dt);
            
            if (completed) {
                // Unclaim the completed segment
                this.game.buildingManager.unclaimWireSegment(wire.id, segIdx);
                
                if (this.game.buildingManager.isWireComplete(wire)) {
                    this.game.buildingManager.completeWire(wire);
                    this.clearTask();
                    this.setState(UnitState.IDLE);
                } else {
                    // Find next segment
                    const nextSite = this.game.buildingManager.findNearestBuildSite(this.x, this.y, this.team, this.id);
                    if (nextSite && nextSite.type === 'wire' && nextSite.wire === wire) {
                        this.targetX = nextSite.x;
                        this.targetY = nextSite.y;
                        this.task.segmentIndex = nextSite.segmentIndex;
                        // Claim the new segment
                        this.game.buildingManager.claimWireSegment(wire.id, nextSite.segmentIndex, this.id);
                        this.setState(UnitState.MOVING);
                    } else {
                        this.clearTask();
                        this.setState(UnitState.IDLE);
                    }
                }
            }
        }
    }
    
    clearTask() {
        if (this.task && this.type === 'worker') {
            // Unclaim any claimed resources
            if (this.game.trenchSystem) {
                this.game.trenchSystem.unclaimAllForWorker(this.id);
            }
            if (this.game.buildingManager) {
                this.game.buildingManager.unclaimAllForWorker(this.id);
            }
        }
        this.task = null;
    }
    
    updateFighting(dt) {
        const enemyTeam = this.team === CONFIG.TEAM_PLAYER ? CONFIG.TEAM_ENEMY : CONFIG.TEAM_PLAYER;
        
        // Look for enemies
        const enemies = this.game.unitManager.getEnemiesInRange(this.x, this.y, this.attackRange, this.team);
        
        // Check for close enemies for melee
        const meleeRange = 25;
        let closestEnemy = null;
        let closestDist = Infinity;
        
        for (const enemy of enemies) {
            const dist = this.distanceTo(enemy.x, enemy.y);
            if (dist < closestDist) {
                closestDist = dist;
                closestEnemy = enemy;
            }
        }
        
        // No enemies in range? Look for more or go idle
        if (!closestEnemy) {
            // Check if there are any enemies further away to engage
            const farEnemies = this.game.unitManager.getEnemiesInRange(this.x, this.y, 400, this.team);
            if (farEnemies.length > 0) {
                // Move toward them
                const target = this.findNearest(farEnemies);
                if (target) {
                    this.targetX = target.x;
                    this.targetY = target.y;
                    this.updateMoving(dt);
                }
            } else {
                this.setState(UnitState.IDLE);
            }
            return;
        }
        
        this.attackTarget = closestEnemy;
        this.facing = closestEnemy.x > this.x ? 1 : -1;
        
        // Melee if very close
        if (closestDist < meleeRange) {
            if (this.attackCooldown <= 0) {
                this.meleeAttack(closestEnemy);
                this.attackCooldown = 0.5;
            }
        } else if (closestDist <= this.attackRange) {
            // Ranged attack
            if (this.attackCooldown <= 0) {
                this.fire(closestEnemy);
                this.attackCooldown = 1 / this.attackRate;
            }
        } else {
            // Move closer
            this.targetX = closestEnemy.x;
            this.targetY = closestEnemy.y;
            this.updateMoving(dt);
        }
    }
    
    updateCharging(dt) {
        const enemyTeam = this.team === CONFIG.TEAM_PLAYER ? CONFIG.TEAM_ENEMY : CONFIG.TEAM_PLAYER;
        
        // First priority: find enemy trench to assault
        const enemyTrench = this.game.trenchSystem.findNearestTrench(this.x, this.y, enemyTeam);
        
        // Second priority: find enemies
        const enemies = this.game.unitManager.getEnemiesInRange(this.x, this.y, 500, this.team);
        
        // Check for very close enemies - melee combat!
        const meleeRange = 25;
        const closeEnemies = enemies.filter(e => {
            const dist = Math.sqrt((e.x - this.x) ** 2 + (e.y - this.y) ** 2);
            return dist < meleeRange;
        });
        
        if (closeEnemies.length > 0) {
            // Melee attack!
            const target = closeEnemies[0];
            if (this.attackCooldown <= 0) {
                this.meleeAttack(target);
                this.attackCooldown = 0.5; // Faster melee
            }
            // Stay close to fight
            this.targetX = target.x;
            this.targetY = target.y;
        } else if (enemyTrench && this.distanceTo(enemyTrench.x, enemyTrench.y) > 30) {
            // Charge toward enemy trench
            this.targetX = enemyTrench.x;
            this.targetY = enemyTrench.y;
            
            // Fire while advancing if enemies in range
            if (enemies.length > 0 && this.attackCooldown <= 0) {
                const nearest = this.findNearest(enemies);
                if (nearest && this.distanceTo(nearest.x, nearest.y) < this.attackRange) {
                    this.fire(nearest);
                    this.attackCooldown = 1 / this.attackRate;
                }
            }
        } else if (enemies.length > 0) {
            // Charge nearest enemy
            const nearest = this.findNearest(enemies);
            if (nearest) {
                this.targetX = nearest.x;
                this.targetY = nearest.y;
                
                if (this.distanceTo(nearest.x, nearest.y) < this.attackRange && this.attackCooldown <= 0) {
                    this.fire(nearest);
                    this.attackCooldown = 1 / this.attackRate;
                }
            }
        } else {
            // No enemies visible, advance toward enemy base
            this.targetX = this.team === CONFIG.TEAM_PLAYER ? CONFIG.MAP_WIDTH - 100 : 100;
            this.targetY = this.y;
        }
        
        this.updateMoving(dt);
        
        // Check if we're now IN an enemy trench - switch to fighting
        const inEnemyTrench = this.game.trenchSystem.isInTrench(this.x, this.y, enemyTeam);
        if (inEnemyTrench) {
            this.setState(UnitState.FIGHTING);
            this.inTrench = true;
        }
    }
    
    meleeAttack(target) {
        // Close combat - more damage, more brutal
        const meleeDamage = 50;
        
        this.game.combatSystem.dealDamage(target, meleeDamage, this);
        
        // Blood effect
        this.game.addEffect('blood', 
            (this.x + target.x) / 2,
            (this.y + target.y) / 2,
            { size: 12, duration: 2 }
        );
        
        // Face the enemy
        this.facing = target.x > this.x ? 1 : -1;
    }
    
    distanceTo(x, y) {
        return Math.sqrt((this.x - x) ** 2 + (this.y - y) ** 2);
    }
    
    findNearest(units) {
        let nearest = null;
        let minDist = Infinity;
        for (const unit of units) {
            const dist = this.distanceTo(unit.x, unit.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = unit;
            }
        }
        return nearest;
    }
    
    fire(target) {
        // Calculate hit chance
        const dist = Math.sqrt((target.x - this.x) ** 2 + (target.y - this.y) ** 2);
        const baseAccuracy = 0.7;
        const distancePenalty = dist / this.attackRange * 0.3;
        const suppressionPenalty = this.suppression / 200;
        
        const hitChance = Math.max(0.1, baseAccuracy - distancePenalty - suppressionPenalty);
        
        // Muzzle flash effect
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.game.addEffect('muzzle', 
            this.x + Math.cos(angle) * 15,
            this.y + Math.sin(angle) * 15,
            { size: 8, duration: 0.1 }
        );
        
        // Check for hit
        if (Math.random() < hitChance) {
            this.game.combatSystem.dealDamage(target, this.attackDamage, this);
        }
    }
    
    takeDamage(amount, attacker) {
        // Apply trench defense bonus
        const defenseBonus = this.game.trenchSystem.getTrenchDefenseBonus(this);
        const actualDamage = amount * (1 - defenseBonus);
        
        this.health -= actualDamage;
        this.suppression = Math.min(100, this.suppression + 20);
        
        if (this.health <= 0) {
            this.die();
        }
        
        // Blood effect
        this.game.addEffect('blood', this.x, this.y, {
            size: 5 + Math.random() * 5,
            duration: 1.5
        });
    }
    
    die() {
        this.state = UnitState.DEAD;
        this.deathTime = 0;
        
        // Clean up worker claims
        if (this.type === 'worker') {
            this.clearTask();
        }
        
        // Clear emplacement assignment
        if (this.mannedBuilding) {
            this.mannedBuilding.assignedUnit = null;
            this.mannedBuilding = null;
        }
        
        // Decrease manpower
        if (this.team === CONFIG.TEAM_PLAYER) {
            this.game.resources.manpower = Math.max(0, this.game.resources.manpower - 1);
        }
    }
    
    render(ctx) {
        const isEnemy = this.team === CONFIG.TEAM_ENEMY;
        
        // Dead units
        if (this.state === UnitState.DEAD) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.PI / 2); // Fallen over
            ctx.globalAlpha = Math.max(0, 1 - this.deathTime / 2);
            this.drawUnit(ctx, isEnemy);
            ctx.restore();
            return;
        }
        
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Selection indicator - Cannon Fodder style arrow pointing down
        if (this.selected) {
            // Animated bouncing arrow
            const bounce = Math.sin(this.animTime * 6) * 2;
            
            // Yellow/orange arrow pointing down at unit
            ctx.fillStyle = CONFIG.COLORS.SELECTION;
            ctx.beginPath();
            ctx.moveTo(0, -12 + bounce);           // Arrow tip
            ctx.lineTo(-5, -20 + bounce);          // Left corner
            ctx.lineTo(-2, -20 + bounce);          // Left inner
            ctx.lineTo(-2, -26 + bounce);          // Left top
            ctx.lineTo(2, -26 + bounce);           // Right top  
            ctx.lineTo(2, -20 + bounce);           // Right inner
            ctx.lineTo(5, -20 + bounce);           // Right corner
            ctx.closePath();
            ctx.fill();
            
            // Darker outline
            ctx.strokeStyle = '#8a6010';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        // Health bar - smaller for tiny units
        if (this.health < this.maxHealth) {
            const barWidth = 10;
            const barHeight = 2;
            const healthPercent = this.health / this.maxHealth;
            
            ctx.fillStyle = '#000';
            ctx.fillRect(-barWidth/2, -12, barWidth, barHeight);
            
            ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : healthPercent > 0.25 ? '#ff0' : '#f00';
            ctx.fillRect(-barWidth/2, -12, barWidth * healthPercent, barHeight);
        }
        
        // Draw the unit
        this.drawUnit(ctx, isEnemy);
        
        ctx.restore();
    }
    
    drawUnit(ctx, isEnemy) {
        // Dark WW1 Cannon Fodder style - tiny pixelated soldiers
        const isMoving = this.state === UnitState.MOVING || this.state === UnitState.CHARGING;
        const legOffset = isMoving ? Math.sin(this.animTime * 15) * 2 : 0;
        
        // Dark shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.fillRect(-4, 5, 8, 3);
        
        if (this.type === 'soldier') {
            const bodyColor = isEnemy ? CONFIG.COLORS.ENEMY_BODY : CONFIG.COLORS.PLAYER_BODY;
            const skinColor = isEnemy ? CONFIG.COLORS.ENEMY_SKIN : CONFIG.COLORS.PLAYER_SKIN;
            
            // Legs (dark, animated when moving)
            ctx.fillStyle = '#2a2a1a';
            if (isMoving) {
                ctx.fillRect(-2 + legOffset, 3, 2, 4);
                ctx.fillRect(1 - legOffset, 3, 2, 4);
            } else {
                ctx.fillRect(-2, 3, 2, 3);
                ctx.fillRect(1, 3, 2, 3);
            }
            
            // Body/tunic
            ctx.fillStyle = bodyColor;
            ctx.fillRect(-3, -2, 7, 6);
            
            // Belt
            ctx.fillStyle = '#3a3a2a';
            ctx.fillRect(-3, 1, 7, 2);
            
            // Head (skin)
            ctx.fillStyle = skinColor;
            ctx.fillRect(-2, -5, 5, 4);
            
            // Helmet (Brodie style for allies, Stahlhelm for enemy)
            if (isEnemy) {
                ctx.fillStyle = '#4a4a3a'; // Grey German helmet
                ctx.fillRect(-3, -7, 7, 3);
                ctx.fillRect(-2, -8, 5, 2);
            } else {
                ctx.fillStyle = '#3a4a3a'; // Khaki British helmet  
                ctx.fillRect(-3, -7, 7, 3);
                ctx.fillRect(-4, -6, 9, 2);
            }
            
            // Rifle
            ctx.fillStyle = '#3a2a1a';
            const gunX = this.facing > 0 ? 4 : -7;
            ctx.fillRect(gunX, -1, 6, 2);
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(this.facing > 0 ? 8 : -7, -1, 3, 2);
            
            // Muzzle flash when shooting
            if (this.attackCooldown > 0.8 / this.attackRate) {
                ctx.fillStyle = CONFIG.COLORS.MUZZLE_FLASH;
                const flashX = this.facing > 0 ? 10 : -9;
                ctx.fillRect(flashX, -2, 4, 3);
                ctx.fillStyle = '#fff';
                ctx.fillRect(flashX + 1, -1, 2, 1);
            }
            
        } else if (this.type === 'worker') {
            const bodyColor = '#5a5040';
            const skinColor = CONFIG.COLORS.PLAYER_SKIN;
            
            // Legs
            ctx.fillStyle = '#3a3020';
            const workAnim = this.state === UnitState.WORKING ? Math.sin(this.animTime * 12) * 2 : legOffset;
            if (isMoving || this.state === UnitState.WORKING) {
                ctx.fillRect(-2 + workAnim, 3, 2, 3);
                ctx.fillRect(1 - workAnim, 3, 2, 3);
            } else {
                ctx.fillRect(-2, 3, 2, 3);
                ctx.fillRect(1, 3, 2, 3);
            }
            
            // Body
            ctx.fillStyle = bodyColor;
            ctx.fillRect(-3, -1, 7, 5);
            
            // Head
            ctx.fillStyle = skinColor;
            ctx.fillRect(-2, -4, 5, 4);
            
            // Flat cap
            ctx.fillStyle = '#3a3020';
            ctx.fillRect(-2, -5, 5, 2);
            ctx.fillRect(-3, -4, 7, 1);
            
            // Shovel
            const shovelAngle = this.state === UnitState.WORKING ? 
                Math.sin(this.animTime * 10) * 0.6 : 0.2;
            ctx.save();
            ctx.rotate(shovelAngle);
            ctx.fillStyle = '#4a3a2a';
            ctx.fillRect(4, -3, 2, 10);
            ctx.fillStyle = '#6a6a6a';
            ctx.fillRect(3, 5, 4, 4);
            ctx.restore();
        }
    }
}

