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
    
    render(ctx, renderer = null) {
        // Sort by Y for depth
        const sortedUnits = [...this.units].sort((a, b) => a.y - b.y);
        
        for (const unit of sortedUnits) {
            // Hide enemy units in fog of war
            if (renderer && unit.team === CONFIG.TEAM_ENEMY) {
                if (!renderer.isPositionVisible(unit.x, unit.y)) {
                    continue; // Don't render enemies in fog
                }
            }
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
        this.visible = true; // Set to false when inside bunkers
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
        this.trenchWaypoint = null; // For trench-preferring pathfinding
        
        // Combat
        this.attackCooldown = 0;
        this.lastShotTime = 0;
        
        // Animation
        this.animTime = Math.random() * 10; // Offset for variety
        this.deathTime = 0;
        
        // MORALE SYSTEM - SHELVED FOR NOW (see README)
        // this.morale = 100;
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
            // Grenade stats
            this.grenadeCount = 2;         // Each soldier carries 2 grenades
            this.maxGrenades = 2;
            this.grenadeCooldown = 0;      // Time until can throw again
            this.grenadeRange = 80;        // Must be this close to throw at target
            this.grenadeDamage = 100;      // High damage to buildings/emplacements
            this.grenadeSplashRadius = 40; // Splash damage radius
        } else if (this.type === 'worker') {
            this.maxHealth = 60;
            this.health = 60;
            this.speed = 55;
            this.radius = 5;          // Even tinier
            this.attackRange = 0;
            this.attackDamage = 0;
            this.attackRate = 0;
            this.buildSpeed = 30;
            this.shellsCarrying = 0;  // Shells being carried
            this.maxShellsCarry = 5;  // Max shells per trip
        }
    }
    
    setState(state) {
        this.state = state;
        
        if (state === UnitState.CHARGING) {
            this.speed = 100; // Faster when charging
            // MORALE SYSTEM - SHELVED FOR NOW (see README)
            // this.morale = Math.min(100, this.morale + 20);
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
        
        // Update grenade cooldown
        if (this.grenadeCooldown > 0) {
            this.grenadeCooldown -= dt;
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
            // PRIORITY 0: If wounded and near a medical tent, seek it for healing
            if (this.health < this.maxHealth * 0.7 && !this.mannedBuilding && !this.inBunker) {
                const medicalTent = this.findNearestMedicalTent();
                if (medicalTent) {
                    // Only seek if within the tent's pull range (healRange)
                    const dist = Math.sqrt((medicalTent.x - this.x) ** 2 + (medicalTent.y - this.y) ** 2);
                    if (dist <= medicalTent.healRange) {
                        this.seekingMedicalTent = medicalTent;
                        this.targetX = medicalTent.x + (Math.random() - 0.5) * 20;
                        this.targetY = medicalTent.y + (Math.random() - 0.5) * 20;
                        this.setState(UnitState.MOVING);
                        return;
                    }
                }
            }
            
            // Clear medical tent seeking if healed
            if (this.seekingMedicalTent && this.health >= this.maxHealth * 0.9) {
                this.seekingMedicalTent = null;
            }
            
            // If in a bunker, stay there and let bunker handle firing
            if (this.inBunker) {
                // Stay in bunker - bunker's updateBunker handles combat
                return;
            }
            
            // If manning an emplacement, stay there and look for enemies
            if (this.mannedBuilding) {
                // Stay at building position
                this.x = this.mannedBuilding.x;
                this.y = this.mannedBuilding.y;
            } else {
                // Not manning anything - check for unmanned emplacements to man
                // But only if not seeking healing
                if (!this.seekingMedicalTent) {
                    const unmanned = this.game.buildingManager.getUnmannedEmplacement(this.team);
                    if (unmanned) {
                        this.assignToEmplacement(unmanned);
                        return;
                    }
                    
                    // Check for available bunkers to enter
                    const bunker = this.game.buildingManager.findAvailableBunker(this.team);
                    if (bunker) {
                        // Move toward the bunker
                        const dist = Math.sqrt((bunker.x - this.x) ** 2 + (bunker.y - this.y) ** 2);
                        if (dist < 30) {
                            // Close enough - enter the bunker
                            this.game.buildingManager.enterBunker(this, bunker);
                            return;
                        } else {
                            // Move to bunker
                            this.targetX = bunker.x;
                            this.targetY = bunker.y;
                            this.seekingBunker = bunker;
                            this.setState(UnitState.MOVING);
                            return;
                        }
                    }
                }
            }
            
            const enemies = this.game.unitManager.getEnemiesInRange(
                this.x, this.y, this.attackRange, this.team
            );
            
            // Also check for enemy buildings (artillery, machine guns) in range
            const enemyTeam = this.team === CONFIG.TEAM_PLAYER ? CONFIG.TEAM_ENEMY : CONFIG.TEAM_PLAYER;
            const enemyBuildings = this.game.buildingManager.buildings.filter(b => 
                b.team === enemyTeam && 
                !b.destroyed && 
                !b.isBlueprint &&
                b.type !== 'hq' && // Don't target HQ from idle - need to charge for that
                Math.sqrt((b.x - this.x) ** 2 + (b.y - this.y) ** 2) <= this.attackRange
            );
            
            // Find closest target (unit or building)
            let closestTarget = null;
            let closestDist = Infinity;
            
            for (const enemy of enemies) {
                const dist = Math.sqrt((enemy.x - this.x) ** 2 + (enemy.y - this.y) ** 2);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestTarget = enemy;
                }
            }
            
            for (const building of enemyBuildings) {
                const dist = Math.sqrt((building.x - this.x) ** 2 + (building.y - this.y) ** 2);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestTarget = building;
                }
            }
            
            // Don't fight if seeking medical tent (prioritize healing)
            if (closestTarget && !this.seekingMedicalTent) {
                this.attackTarget = closestTarget;
                this.setState(UnitState.FIGHTING);
            }
        }
        
        // Workers: Look for tasks (repair first, then build, then haul shells)
        if (this.type === 'worker' && !this.task) {
            // PRIORITY 1: Check for damaged structures to repair
            let repairTarget = this.findRepairTask();
            if (repairTarget) {
                this.assignRepairTask(repairTarget);
                return;
            }
            
            // PRIORITY 2: Check for trench building (pass worker ID to respect claims)
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
            
            // PRIORITY 3: Check for emplacement/wire building (pass worker ID to respect claims)
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
                return;
            }
            
            // PRIORITY 4: Check for shell hauling (artillery needs ammo)
            if (this.team === CONFIG.TEAM_PLAYER) {
                const shellTask = this.findShellHaulingTask();
                if (shellTask) {
                    this.assignShellHaulingTask(shellTask);
                    return;
                }
            }
        }
    }
    
    // Find shell hauling task - artillery that needs ammo (respects claims)
    findShellHaulingTask() {
        // Check if there are shells to haul
        if (this.game.resources.shells <= 0) return null;
        
        // Find artillery that needs ammo - pass worker ID for claiming
        const artillery = this.game.buildingManager.findArtilleryNeedingResupply(
            this.team, 
            this.id
        );
        
        if (artillery) {
            return { artillery };
        }
        
        return null;
    }
    
    // Assign shell hauling task (claims the artillery to prevent bunching)
    assignShellHaulingTask(shellTask) {
        const hq = this.game.buildingManager.getHQ(this.team);
        if (!hq) return;
        
        this.task = {
            type: 'haul_shells',
            phase: 'to_hq', // 'to_hq' -> 'loading' -> 'to_artillery' -> 'unloading'
            targetArtillery: shellTask.artillery,
            hq: hq
        };
        
        // Claim the artillery for resupply
        this.game.buildingManager.claimArtillery(shellTask.artillery.id, this.id);
        
        // Go to HQ first to pick up shells
        this.targetX = hq.x;
        this.targetY = hq.y;
        this.setState(UnitState.MOVING);
    }
    
    // Find repair tasks for workers (respects claims to avoid bunching)
    findRepairTask() {
        // Check for damaged buildings first (higher priority) - pass worker ID for claiming
        let repairTarget = this.game.buildingManager.findDamagedStructure(this.x, this.y, this.team, this.id);
        if (repairTarget) return repairTarget;
        
        // Check for damaged trenches - pass worker ID for claiming
        repairTarget = this.game.trenchSystem.findDamagedTrench(this.x, this.y, this.team, this.id);
        return repairTarget;
    }
    
    // Find the nearest friendly medical tent for healing
    findNearestMedicalTent() {
        const medicalTents = this.game.buildingManager.buildings.filter(b => 
            b.type === 'medical_tent' && 
            b.team === this.team && 
            !b.destroyed && 
            !b.isBlueprint
        );
        
        if (medicalTents.length === 0) return null;
        
        let closest = null;
        let closestDist = Infinity;
        
        for (const tent of medicalTents) {
            const dist = Math.sqrt((tent.x - this.x) ** 2 + (tent.y - this.y) ** 2);
            if (dist < closestDist) {
                closestDist = dist;
                closest = tent;
            }
        }
        
        return closest;
    }
    
    // Assign a repair task to this worker (claims the target to prevent bunching)
    assignRepairTask(repairTarget) {
        if (repairTarget.type === 'building') {
            this.assignTask({
                type: 'repair_building',
                building: repairTarget.target
            });
            // Claim the building for repair
            this.game.buildingManager.claimRepair(repairTarget.target.id, this.id);
        } else if (repairTarget.type === 'trench' || repairTarget.type === 'trench_rebuild') {
            this.assignTask({
                type: 'repair_trench',
                trench: repairTarget.target,
                segmentIndex: repairTarget.segmentIndex,
                isRebuild: repairTarget.type === 'trench_rebuild'
            });
            // Claim the trench segment for repair
            this.game.trenchSystem.claimTrenchRepair(repairTarget.target.id, repairTarget.segmentIndex, this.id);
        }
        
        this.targetX = repairTarget.x;
        this.targetY = repairTarget.y;
        this.setState(UnitState.MOVING);
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
            
            // Clear waypoint when arrived
            this.trenchWaypoint = null;
            
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
                    this.task.type === 'build_wire' ||
                    this.task.type === 'repair_building' ||
                    this.task.type === 'repair_trench' ||
                    this.task.type === 'haul_shells') {
                    this.setState(UnitState.WORKING);
                    return;
                }
            }
            
            // Check if we were seeking a bunker - enter it
            if (this.seekingBunker && !this.seekingBunker.destroyed && !this.seekingBunker.isBlueprint) {
                if (this.seekingBunker.occupants.length < this.seekingBunker.capacity) {
                    this.game.buildingManager.enterBunker(this, this.seekingBunker);
                }
                this.seekingBunker = null;
                return;
            }
            
            if (this.state === UnitState.RETREATING) {
                this.setState(UnitState.IDLE);
            } else {
                this.setState(UnitState.IDLE);
            }
            return;
        }
        
        // Check if we should use trench pathfinding (workers and soldiers prefer trenches)
        let moveTargetX = this.targetX;
        let moveTargetY = this.targetY;
        
        // Only use trench pathfinding if not charging
        if (this.state !== UnitState.CHARGING) {
            const waypoint = this.getTrenchWaypoint();
            if (waypoint) {
                moveTargetX = waypoint.x;
                moveTargetY = waypoint.y;
            }
        }
        
        // Calculate movement direction
        const mdx = moveTargetX - this.x;
        const mdy = moveTargetY - this.y;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        
        // Move toward target/waypoint
        let moveSpeed = this.speed * (1 - this.suppression / 200);
        
        // Speed bonus when moving in trenches (for protection)
        const inTrench = this.game.trenchSystem.isInTrench(this.x, this.y, this.team);
        if (inTrench) {
            moveSpeed *= 1.15; // 15% speed bonus in trenches
        }
        
        const vx = (mdx / mdist) * moveSpeed;
        const vy = (mdy / mdist) * moveSpeed;
        
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
    
    // Get next waypoint along trench path (prefers trenches for protection)
    getTrenchWaypoint() {
        // Don't use trench pathing for charging units or if already at waypoint
        if (this.state === UnitState.CHARGING) return null;
        
        // Check if we have a current waypoint
        if (this.trenchWaypoint) {
            const waypointDist = Math.sqrt(
                (this.x - this.trenchWaypoint.x) ** 2 + 
                (this.y - this.trenchWaypoint.y) ** 2
            );
            
            // If we've reached the waypoint, clear it
            if (waypointDist < 15) {
                this.trenchWaypoint = null;
            } else {
                return this.trenchWaypoint;
            }
        }
        
        // Check if we're currently in a trench
        const currentTrench = this.game.trenchSystem.isInTrench(this.x, this.y, this.team);
        
        // Check if target is in a trench
        const targetTrench = this.game.trenchSystem.isInTrench(this.targetX, this.targetY, this.team);
        
        // If we're already in a trench and target is also in trench (or near trench), 
        // find the best path along the trench
        if (currentTrench) {
            // Try to find connected path along trenches
            const nextPoint = this.findNextTrenchPoint(currentTrench);
            if (nextPoint) {
                this.trenchWaypoint = nextPoint;
                return nextPoint;
            }
        }
        
        // If not in trench but there's a nearby friendly trench between us and target,
        // route through it
        if (!currentTrench) {
            const nearbyTrench = this.game.trenchSystem.findNearestTrench(this.x, this.y, this.team);
            if (nearbyTrench) {
                const distToTrench = Math.sqrt(
                    (this.x - nearbyTrench.x) ** 2 + 
                    (this.y - nearbyTrench.y) ** 2
                );
                
                const distToTarget = Math.sqrt(
                    (this.x - this.targetX) ** 2 + 
                    (this.y - this.targetY) ** 2
                );
                
                // Only use trench routing if it's reasonably close and the target is far
                if (distToTrench < 100 && distToTarget > 150) {
                    // Check if trench is roughly on the way
                    const angleToTarget = Math.atan2(this.targetY - this.y, this.targetX - this.x);
                    const angleToTrench = Math.atan2(nearbyTrench.y - this.y, nearbyTrench.x - this.x);
                    const angleDiff = Math.abs(angleToTarget - angleToTrench);
                    
                    // Only route through trench if it's within 90 degrees of our target direction
                    if (angleDiff < Math.PI / 2 || angleDiff > Math.PI * 1.5) {
                        this.trenchWaypoint = { x: nearbyTrench.x, y: nearbyTrench.y };
                        return this.trenchWaypoint;
                    }
                }
            }
        }
        
        return null;
    }
    
    // Find the next point along a trench toward our target
    findNextTrenchPoint(trench) {
        // Find which point in the trench is closest to our target
        let bestPoint = null;
        let bestDist = Infinity;
        
        for (const segment of trench.segments) {
            if (!segment.built || segment.destroyed) continue;
            
            // Check both endpoints
            for (const point of [segment.start, segment.end]) {
                const distToTarget = Math.sqrt(
                    (point.x - this.targetX) ** 2 + 
                    (point.y - this.targetY) ** 2
                );
                
                // Make sure this point is closer to target than we are
                const ourDistToTarget = Math.sqrt(
                    (this.x - this.targetX) ** 2 + 
                    (this.y - this.targetY) ** 2
                );
                
                if (distToTarget < ourDistToTarget && distToTarget < bestDist) {
                    bestDist = distToTarget;
                    bestPoint = { x: point.x, y: point.y };
                }
            }
        }
        
        // If the best point is very close to target, just go directly
        if (bestPoint && bestDist < 30) {
            return null;
        }
        
        return bestPoint;
    }
    
    updateWorking(dt) {
        if (!this.task) {
            this.setState(UnitState.IDLE);
            return;
        }
        
        // Safety check - verify task target still exists and needs building/repairing
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
        } else if (this.task.type === 'repair_building') {
            if (!this.task.building || this.task.building.destroyed || this.task.building.health >= this.task.building.maxHealth) {
                this.clearTask();
                this.setState(UnitState.IDLE);
                return;
            }
        } else if (this.task.type === 'repair_trench') {
            const segment = this.task.trench.segments[this.task.segmentIndex];
            if (!segment || (!segment.damaged && !segment.destroyed)) {
                this.clearTask();
                this.setState(UnitState.IDLE);
                return;
            }
        } else if (this.task.type === 'haul_shells') {
            // Check if artillery still exists
            if (this.task.targetArtillery && this.task.targetArtillery.destroyed) {
                // Unclaim the artillery
                this.game.buildingManager.unclaimArtillery(this.task.targetArtillery.id);
                // Return any shells we're carrying
                if (this.shellsCarrying > 0) {
                    this.game.resources.shells += this.shellsCarrying;
                    this.shellsCarrying = 0;
                }
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
            const segment = trench.segments[segIdx];
            
            const completed = this.game.trenchSystem.buildSegment(trench, segIdx, this.buildSpeed * dt);
            
            // Move worker along the trench line as they build
            if (segment) {
                this.x = segment.start.x + (segment.end.x - segment.start.x) * segment.progress;
                this.y = segment.start.y + (segment.end.y - segment.start.y) * segment.progress;
            }
            
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
            const segment = wire.segments[segIdx];
            
            if (wire.destroyed) {
                this.clearTask();
                this.setState(UnitState.IDLE);
                return;
            }
            
            const completed = this.game.buildingManager.buildWireSegment(wire, segIdx, this.buildSpeed * dt);
            
            // Move worker along the wire line as they build
            if (segment) {
                this.x = segment.start.x + (segment.end.x - segment.start.x) * segment.progress;
                this.y = segment.start.y + (segment.end.y - segment.start.y) * segment.progress;
            }
            
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
        } else if (this.task.type === 'repair_building') {
            // Repair a damaged building
            const building = this.task.building;
            
            // Add sparks effect for repair
            if (Math.random() < dt * 8) {
                this.game.addEffect('muzzle', this.x + (Math.random() - 0.5) * 15, this.y - 5, {
                    size: 4 + Math.random() * 4,
                    duration: 0.15
                });
            }
            
            const completed = this.game.buildingManager.repairBuilding(building, this.buildSpeed * dt * 0.5);
            
            if (completed) {
                // Unclaim the repair
                this.game.buildingManager.unclaimRepair(building.id);
                this.clearTask();
                this.setState(UnitState.IDLE);
            }
        } else if (this.task.type === 'repair_trench') {
            // Repair a damaged trench segment
            const trench = this.task.trench;
            const segIdx = this.task.segmentIndex;
            
            const completed = this.game.trenchSystem.repairTrenchSegment(trench, segIdx, this.buildSpeed * dt * 0.5);
            
            if (completed) {
                // Unclaim the completed segment
                this.game.trenchSystem.unclaimTrenchRepair(trench.id, segIdx);
                
                // Check if there are more segments to repair on this trench (pass worker ID for claiming)
                const nextRepairTarget = this.game.trenchSystem.findDamagedTrench(this.x, this.y, this.team, this.id);
                
                if (nextRepairTarget && nextRepairTarget.target === trench) {
                    this.task.segmentIndex = nextRepairTarget.segmentIndex;
                    this.task.isRebuild = nextRepairTarget.type === 'trench_rebuild';
                    this.targetX = nextRepairTarget.x;
                    this.targetY = nextRepairTarget.y;
                    // Claim the new segment
                    this.game.trenchSystem.claimTrenchRepair(trench.id, nextRepairTarget.segmentIndex, this.id);
                    this.setState(UnitState.MOVING);
                } else {
                    this.clearTask();
                    this.setState(UnitState.IDLE);
                }
            }
        } else if (this.task.type === 'haul_shells') {
            this.updateShellHauling(dt);
        }
    }
    
    updateShellHauling(dt) {
        const task = this.task;
        
        if (task.phase === 'to_hq') {
            // Should be at HQ now, pick up shells
            const distToHQ = Math.sqrt(
                (this.x - task.hq.x) ** 2 + (this.y - task.hq.y) ** 2
            );
            
            if (distToHQ < 40) {
                task.phase = 'loading';
                task.loadTime = 0;
            }
        } else if (task.phase === 'loading') {
            // Loading shells from HQ
            task.loadTime += dt;
            
            // Create loading effect
            if (Math.random() < dt * 3) {
                this.game.addEffect('muzzle', this.x, this.y - 5, {
                    size: 5,
                    duration: 0.2
                });
            }
            
            if (task.loadTime >= 1) {
                // Pick up shells
                const shellsToTake = Math.min(
                    this.maxShellsCarry,
                    this.game.resources.shells
                );
                
                if (shellsToTake > 0) {
                    this.game.resources.shells -= shellsToTake;
                    this.shellsCarrying = shellsToTake;
                    
                    // Now go to artillery
                    task.phase = 'to_artillery';
                    this.targetX = task.targetArtillery.x;
                    this.targetY = task.targetArtillery.y;
                    this.setState(UnitState.MOVING);
                } else {
                    // No shells available
                    this.clearTask();
                    this.setState(UnitState.IDLE);
                }
            }
        } else if (task.phase === 'to_artillery') {
            // Check if artillery still exists and needs ammo
            if (task.targetArtillery.destroyed || 
                task.targetArtillery.ammoCount >= task.targetArtillery.maxAmmo) {
                // Unclaim the artillery
                this.game.buildingManager.unclaimArtillery(task.targetArtillery.id);
                // Return shells to stockpile and find new task
                this.game.resources.shells += this.shellsCarrying;
                this.shellsCarrying = 0;
                this.clearTask();
                this.setState(UnitState.IDLE);
                return;
            }
            
            const distToArt = Math.sqrt(
                (this.x - task.targetArtillery.x) ** 2 + 
                (this.y - task.targetArtillery.y) ** 2
            );
            
            if (distToArt < 50) {
                task.phase = 'unloading';
                task.unloadTime = 0;
            }
        } else if (task.phase === 'unloading') {
            // Unloading shells to artillery
            task.unloadTime += dt;
            
            // Create unloading effect
            if (Math.random() < dt * 4) {
                this.game.addEffect('muzzle', 
                    task.targetArtillery.x + (Math.random() - 0.5) * 20, 
                    task.targetArtillery.y - 10, 
                    { size: 6, duration: 0.15 }
                );
            }
            
            if (task.unloadTime >= 0.8) {
                // Deliver shells
                const shellsToDeliver = Math.min(
                    this.shellsCarrying,
                    task.targetArtillery.maxAmmo - task.targetArtillery.ammoCount
                );
                
                task.targetArtillery.ammoCount += shellsToDeliver;
                this.shellsCarrying -= shellsToDeliver;
                
                // Unclaim the artillery we just resupplied
                this.game.buildingManager.unclaimArtillery(task.targetArtillery.id);
                
                // If we have leftover shells and artillery isn't full, return to idle
                // Otherwise continue to next artillery or go back to HQ
                if (this.shellsCarrying > 0) {
                    // Return leftover to stockpile
                    this.game.resources.shells += this.shellsCarrying;
                    this.shellsCarrying = 0;
                }
                
                // Check if more artillery needs ammo
                const nextArtillery = this.findShellHaulingTask();
                if (nextArtillery && this.game.resources.shells > 0) {
                    this.assignShellHaulingTask(nextArtillery);
                } else {
                    this.clearTask();
                    this.setState(UnitState.IDLE);
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
        
        // TRY TO THROW GRENADES at enemy buildings/emplacements when in range!
        if (this.grenadeCount > 0 && this.grenadeCooldown <= 0) {
            const grenadeTarget = this.findGrenadeTarget(enemyTeam);
            if (grenadeTarget) {
                this.throwGrenade(grenadeTarget);
            }
        }
        
        // Look for enemy units
        const enemies = this.game.unitManager.getEnemiesInRange(this.x, this.y, this.attackRange, this.team);
        
        // Also look for enemy buildings (artillery, machine guns) in attack range
        const enemyBuildings = this.game.buildingManager.buildings.filter(b => 
            b.team === enemyTeam && 
            !b.destroyed && 
            !b.isBlueprint &&
            b.type !== 'hq' && // HQ requires charging
            Math.sqrt((b.x - this.x) ** 2 + (b.y - this.y) ** 2) <= this.attackRange
        );
        
        // Check for close enemies for melee
        const meleeRange = 25;
        let closestTarget = null;
        let closestDist = Infinity;
        let targetIsBuilding = false;
        
        for (const enemy of enemies) {
            const dist = this.distanceTo(enemy.x, enemy.y);
            if (dist < closestDist) {
                closestDist = dist;
                closestTarget = enemy;
                targetIsBuilding = false;
            }
        }
        
        // Check enemy buildings - treat them as valid targets
        for (const building of enemyBuildings) {
            const dist = this.distanceTo(building.x, building.y);
            if (dist < closestDist) {
                closestDist = dist;
                closestTarget = building;
                targetIsBuilding = true;
            }
        }
        
        // No targets in range? Look for more or go idle
        if (!closestTarget) {
            // Check for any enemies further away to engage
            const farEnemies = this.game.unitManager.getEnemiesInRange(this.x, this.y, 400, this.team);
            // Also check for far enemy buildings
            const farBuildings = this.game.buildingManager.buildings.filter(b => 
                b.team === enemyTeam && 
                !b.destroyed && 
                !b.isBlueprint &&
                b.type !== 'hq' &&
                Math.sqrt((b.x - this.x) ** 2 + (b.y - this.y) ** 2) <= 400
            );
            
            if (farEnemies.length > 0 || farBuildings.length > 0) {
                // Find the closest far target
                let target = null;
                let minDist = Infinity;
                
                for (const enemy of farEnemies) {
                    const dist = this.distanceTo(enemy.x, enemy.y);
                    if (dist < minDist) {
                        minDist = dist;
                        target = enemy;
                    }
                }
                for (const building of farBuildings) {
                    const dist = this.distanceTo(building.x, building.y);
                    if (dist < minDist) {
                        minDist = dist;
                        target = building;
                    }
                }
                
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
        
        this.attackTarget = closestTarget;
        this.facing = closestTarget.x > this.x ? 1 : -1;
        
        // Melee if very close (only for units, not buildings)
        if (!targetIsBuilding && closestDist < meleeRange) {
            if (this.attackCooldown <= 0) {
                this.meleeAttack(closestTarget);
                this.attackCooldown = 0.5;
            }
        } else if (closestDist <= this.attackRange) {
            // Ranged attack
            if (this.attackCooldown <= 0) {
                if (targetIsBuilding) {
                    this.fireAtBuilding(closestTarget);
                } else {
                    this.fire(closestTarget);
                }
                this.attackCooldown = 1 / this.attackRate;
            }
        } else {
            // Move closer
            this.targetX = closestTarget.x;
            this.targetY = closestTarget.y;
            this.updateMoving(dt);
        }
    }
    
    updateCharging(dt) {
        const enemyTeam = this.team === CONFIG.TEAM_PLAYER ? CONFIG.TEAM_ENEMY : CONFIG.TEAM_PLAYER;
        
        // Find nearest enemy building to destroy
        const enemyBuildings = this.game.buildingManager.buildings.filter(b => 
            b.team === enemyTeam && !b.destroyed && !b.isBlueprint
        );
        
        // Find nearest building (simple distance check)
        let targetBuilding = null;
        let targetBuildingDist = Infinity;
        for (const b of enemyBuildings) {
            const dist = this.distanceTo(b.x, b.y);
            if (dist < targetBuildingDist) {
                targetBuildingDist = dist;
                targetBuilding = b;
            }
        }
        
        // Find enemy trench
        const enemyTrench = this.game.trenchSystem.findNearestTrench(this.x, this.y, enemyTeam);
        
        // Find enemies
        const enemies = this.game.unitManager.getEnemiesInRange(this.x, this.y, 500, this.team);
        
        // Check for very close enemies - melee combat!
        const meleeRange = 25;
        const closeEnemies = enemies.filter(e => {
            const dist = Math.sqrt((e.x - this.x) ** 2 + (e.y - this.y) ** 2);
            return dist < meleeRange;
        });
        
        // TRY TO THROW GRENADES at enemy buildings/emplacements when in range!
        if (this.grenadeCount > 0 && this.grenadeCooldown <= 0) {
            const grenadeTarget = this.findGrenadeTarget(enemyTeam);
            if (grenadeTarget) {
                this.throwGrenade(grenadeTarget);
            }
        }
        
        if (closeEnemies.length > 0) {
            // Melee attack close enemies first!
            const target = closeEnemies[0];
            if (this.attackCooldown <= 0) {
                this.meleeAttack(target);
                this.attackCooldown = 0.5; // Faster melee
            }
            // Stay close to fight
            this.targetX = target.x;
            this.targetY = target.y;
        } else if (targetBuilding) {
            // PRIORITY: Charge toward enemy buildings to destroy them!
            const distToBuilding = this.distanceTo(targetBuilding.x, targetBuilding.y);
            this.targetX = targetBuilding.x;
            this.targetY = targetBuilding.y;
            
            // If close enough, melee attack the building
            if (distToBuilding < 30 && this.attackCooldown <= 0) {
                this.game.buildingManager.takeDamage(targetBuilding, 15);
                this.attackCooldown = 0.8;
                // Visual feedback
                this.game.addEffect('dirt', targetBuilding.x, targetBuilding.y, {
                    size: 10,
                    duration: 0.3
                });
            }
            
            // Fire at enemies while advancing
            if (enemies.length > 0 && this.attackCooldown <= 0) {
                const nearest = this.findNearest(enemies);
                if (nearest && this.distanceTo(nearest.x, nearest.y) < this.attackRange) {
                    this.fire(nearest);
                    this.attackCooldown = 1 / this.attackRate;
                }
            }
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
    
    // Find enemy building/emplacement to throw grenade at
    findGrenadeTarget(enemyTeam) {
        // Look for enemy buildings (MGs, artillery) within grenade range
        const buildings = this.game.buildingManager.buildings.filter(b => 
            b.team === enemyTeam && 
            !b.destroyed && 
            !b.isBlueprint &&
            (b.type === 'machinegun' || b.type === 'artillery')
        );
        
        let nearestBuilding = null;
        let nearestDist = Infinity;
        
        for (const building of buildings) {
            const dist = this.distanceTo(building.x, building.y);
            if (dist < this.grenadeRange && dist < nearestDist) {
                nearestDist = dist;
                nearestBuilding = building;
            }
        }
        
        // If no buildings in range, try to grenade clustered enemies
        if (!nearestBuilding) {
            // Find enemies close together (good grenade target)
            const nearbyEnemies = this.game.unitManager.getEnemiesInRange(
                this.x, this.y, this.grenadeRange, this.team
            );
            
            // Only grenade if there are multiple enemies grouped together
            if (nearbyEnemies.length >= 2) {
                // Find the cluster center
                let clusterX = 0, clusterY = 0;
                for (const enemy of nearbyEnemies) {
                    clusterX += enemy.x;
                    clusterY += enemy.y;
                }
                clusterX /= nearbyEnemies.length;
                clusterY /= nearbyEnemies.length;
                
                return { x: clusterX, y: clusterY, type: 'cluster' };
            }
        }
        
        return nearestBuilding;
    }
    
    // Throw a grenade at the target
    throwGrenade(target) {
        this.grenadeCount--;
        this.grenadeCooldown = 2.5; // 2.5 second cooldown between throws
        
        // Face the target
        this.facing = target.x > this.x ? 1 : -1;
        
        // Create the flying grenade effect
        const flightTime = 0.6; // seconds for grenade to reach target
        
        // Add grenade throw animation/effect
        this.game.addEffect('grenade', this.x, this.y, {
            targetX: target.x,
            targetY: target.y,
            duration: flightTime,
            damage: this.grenadeDamage,
            splashRadius: this.grenadeSplashRadius,
            source: this
        });
        
        // Show soldier's throwing animation (brief arm motion via muzzle effect)
        this.game.addEffect('muzzle', 
            this.x + this.facing * 8,
            this.y - 5,
            { size: 4, duration: 0.1 }
        );
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
    
    fireAtBuilding(building) {
        // Shooting at buildings - easier to hit (they're bigger) but less damage
        const dist = Math.sqrt((building.x - this.x) ** 2 + (building.y - this.y) ** 2);
        const baseAccuracy = 0.85; // Easier to hit a building
        const distancePenalty = dist / this.attackRange * 0.2;
        const suppressionPenalty = this.suppression / 200;
        
        const hitChance = Math.max(0.2, baseAccuracy - distancePenalty - suppressionPenalty);
        
        // Muzzle flash effect
        const angle = Math.atan2(building.y - this.y, building.x - this.x);
        this.game.addEffect('muzzle', 
            this.x + Math.cos(angle) * 15,
            this.y + Math.sin(angle) * 15,
            { size: 8, duration: 0.1 }
        );
        
        // Check for hit - reduced damage against buildings (rifles aren't great vs structures)
        if (Math.random() < hitChance) {
            const buildingDamage = this.attackDamage * 0.3; // 30% damage vs buildings
            this.game.buildingManager.takeDamage(building, buildingDamage);
        }
    }
    
    takeDamage(amount, attacker) {
        // Apply bunker protection (highest priority)
        let defenseBonus = 0;
        if (this.inBunker && !this.inBunker.destroyed) {
            defenseBonus = this.inBunker.protection || CONFIG.BUNKER_PROTECTION;
        } else {
            // Apply trench defense bonus
            defenseBonus = this.game.trenchSystem.getTrenchDefenseBonus(this);
        }
        
        const actualDamage = amount * (1 - defenseBonus);
        
        this.health -= actualDamage;
        this.suppression = Math.min(100, this.suppression + 20);
        
        if (this.health <= 0) {
            this.die();
        }
        
        // Blood effect (only if not in bunker)
        if (!this.inBunker) {
            this.game.addEffect('blood', this.x, this.y, {
                size: 5 + Math.random() * 5,
                duration: 1.5
            });
        }
    }
    
    die() {
        this.state = UnitState.DEAD;
        this.deathTime = 0;
        
        // Clean up worker claims
        if (this.type === 'worker') {
            // Return any shells being carried
            if (this.shellsCarrying > 0) {
                this.game.resources.shells += this.shellsCarrying;
                this.shellsCarrying = 0;
            }
            this.clearTask();
        }
        
        // Clear emplacement assignment
        if (this.mannedBuilding) {
            this.mannedBuilding.assignedUnit = null;
            this.mannedBuilding = null;
        }
        
        // Exit bunker if inside one
        if (this.inBunker) {
            this.game.buildingManager.exitBunker(this);
        }
        
        // Clear healing flag
        this.isBeingHealed = false;
        
        // Decrease manpower
        if (this.team === CONFIG.TEAM_PLAYER) {
            this.game.resources.manpower = Math.max(0, this.game.resources.manpower - 1);
        }
    }
    
    render(ctx) {
        // Don't render units that are hidden (e.g. inside bunkers)
        if (!this.visible) return;
        
        const isEnemy = this.team === CONFIG.TEAM_ENEMY;
        
        // Dead units - Cannon Fodder style bodies stay on ground
        if (this.state === UnitState.DEAD) {
            this.drawDeadUnit(ctx, isEnemy);
            return;
        }
        
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Selection indicator - Classic Cannon Fodder bouncing arrow
        if (this.selected) {
            this.drawSelectionArrow(ctx);
        }
        
        // Health bar - tiny, Cannon Fodder style
        if (this.health < this.maxHealth && this.state !== UnitState.DEAD) {
            this.drawHealthBar(ctx);
        }
        
        // Draw the unit
        this.drawUnit(ctx, isEnemy);
        
        ctx.restore();
    }
    
    drawSelectionArrow(ctx) {
        // Classic Cannon Fodder yellow bouncing arrow
        const bounce = Math.sin(this.animTime * 8) * 3;
        const pulse = 0.9 + Math.sin(this.animTime * 12) * 0.1;
        
        ctx.save();
        ctx.translate(0, bounce);
        ctx.scale(pulse, pulse);
        
        // Glow effect
        ctx.fillStyle = CONFIG.COLORS.SELECTION_GLOW;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(-7, -20);
        ctx.lineTo(-3, -20);
        ctx.lineTo(-3, -28);
        ctx.lineTo(3, -28);
        ctx.lineTo(3, -20);
        ctx.lineTo(7, -20);
        ctx.closePath();
        ctx.fill();
        
        // Main arrow
        ctx.globalAlpha = 1;
        ctx.fillStyle = CONFIG.COLORS.SELECTION;
        ctx.beginPath();
        ctx.moveTo(0, -11);           // Arrow tip
        ctx.lineTo(-6, -19);          // Left corner
        ctx.lineTo(-2, -19);          // Left inner
        ctx.lineTo(-2, -26);          // Left top
        ctx.lineTo(2, -26);           // Right top  
        ctx.lineTo(2, -19);           // Right inner
        ctx.lineTo(6, -19);           // Right corner
        ctx.closePath();
        ctx.fill();
        
        // Arrow highlight
        ctx.fillStyle = '#ffee88';
        ctx.fillRect(-1, -24, 2, 4);
        ctx.fillRect(-1, -17, 2, 3);
        
        // Dark outline
        ctx.strokeStyle = '#8a6010';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(-6, -19);
        ctx.lineTo(-2, -19);
        ctx.lineTo(-2, -26);
        ctx.lineTo(2, -26);
        ctx.lineTo(2, -19);
        ctx.lineTo(6, -19);
        ctx.closePath();
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawHealthBar(ctx) {
        const barWidth = 12;
        const barHeight = 2;
        const healthPercent = this.health / this.maxHealth;
        
        // Background
        ctx.fillStyle = '#000000';
        ctx.fillRect(-barWidth/2 - 1, -13, barWidth + 2, barHeight + 2);
        
        // Health
        const healthColor = healthPercent > 0.6 ? '#44dd44' : 
                           healthPercent > 0.3 ? '#dddd44' : '#dd4444';
        ctx.fillStyle = healthColor;
        ctx.fillRect(-barWidth/2, -12, barWidth * healthPercent, barHeight);
    }
    
    drawDeadUnit(ctx, isEnemy) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Fade out over time
        const fadeStart = 8; // Start fading at 8 seconds
        const alpha = this.deathTime > fadeStart ? 
            Math.max(0, 1 - (this.deathTime - fadeStart) / 4) : 1;
        ctx.globalAlpha = alpha;
        
        // Random death pose based on unit ID
        const deathPose = this.id % 4;
        const flip = this.id % 2 === 0 ? 1 : -1;
        
        ctx.scale(flip, 1);
        
        // Draw blood pool underneath
        ctx.fillStyle = CONFIG.COLORS.BLOOD_POOL;
        const poolSize = 6 + Math.min(this.deathTime * 2, 10);
        ctx.beginPath();
        ctx.ellipse(0, 4, poolSize, poolSize * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw body based on death pose
        switch (deathPose) {
            case 0: // Face down
                this.drawDeadPoseFaceDown(ctx, isEnemy);
                break;
            case 1: // Face up
                this.drawDeadPoseFaceUp(ctx, isEnemy);
                break;
            case 2: // On side
                this.drawDeadPoseSide(ctx, isEnemy);
                break;
            case 3: // Crumpled
                this.drawDeadPoseCrumpled(ctx, isEnemy);
                break;
        }
        
        ctx.restore();
    }
    
    drawDeadPoseFaceDown(ctx, isEnemy) {
        const bodyColor = isEnemy ? CONFIG.COLORS.ENEMY_BODY : CONFIG.COLORS.PLAYER_BODY;
        const helmetColor = isEnemy ? CONFIG.COLORS.ENEMY_HELMET : CONFIG.COLORS.PLAYER_HELMET;
        
        // Legs spread
        ctx.fillStyle = '#2a2a1a';
        ctx.fillRect(-5, 2, 3, 6);
        ctx.fillRect(2, 1, 3, 7);
        
        // Body
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-4, -3, 8, 7);
        
        // Arms out
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-8, -2, 5, 3);
        ctx.fillRect(4, -1, 5, 3);
        
        // Head/helmet
        ctx.fillStyle = helmetColor;
        ctx.beginPath();
        ctx.ellipse(0, -5, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawDeadPoseFaceUp(ctx, isEnemy) {
        const bodyColor = isEnemy ? CONFIG.COLORS.ENEMY_BODY : CONFIG.COLORS.PLAYER_BODY;
        const skinColor = isEnemy ? CONFIG.COLORS.ENEMY_SKIN : CONFIG.COLORS.PLAYER_SKIN;
        
        // Legs
        ctx.fillStyle = '#2a2a1a';
        ctx.fillRect(-4, 3, 3, 5);
        ctx.fillRect(1, 2, 3, 6);
        
        // Body
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-4, -2, 8, 6);
        
        // Arms
        ctx.fillStyle = skinColor;
        ctx.fillRect(-7, -1, 4, 2);
        ctx.fillRect(4, 0, 4, 2);
        
        // Face
        ctx.fillStyle = skinColor;
        ctx.fillRect(-2, -5, 5, 4);
        
        // Eyes closed (X marks)
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(-1, -4, 1, 1);
        ctx.fillRect(1, -4, 1, 1);
    }
    
    drawDeadPoseSide(ctx, isEnemy) {
        const bodyColor = isEnemy ? CONFIG.COLORS.ENEMY_BODY : CONFIG.COLORS.PLAYER_BODY;
        const skinColor = isEnemy ? CONFIG.COLORS.ENEMY_SKIN : CONFIG.COLORS.PLAYER_SKIN;
        const helmetColor = isEnemy ? CONFIG.COLORS.ENEMY_HELMET : CONFIG.COLORS.PLAYER_HELMET;
        
        // Curled legs
        ctx.fillStyle = '#2a2a1a';
        ctx.fillRect(2, 2, 6, 3);
        ctx.fillRect(6, 4, 3, 2);
        
        // Body (side view)
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-2, -1, 7, 5);
        
        // Arm
        ctx.fillStyle = skinColor;
        ctx.fillRect(-5, 0, 4, 2);
        
        // Head
        ctx.fillStyle = skinColor;
        ctx.fillRect(-5, -4, 4, 4);
        
        // Helmet
        ctx.fillStyle = helmetColor;
        ctx.fillRect(-6, -5, 5, 2);
    }
    
    drawDeadPoseCrumpled(ctx, isEnemy) {
        const bodyColor = isEnemy ? CONFIG.COLORS.ENEMY_BODY : CONFIG.COLORS.PLAYER_BODY;
        const helmetColor = isEnemy ? CONFIG.COLORS.ENEMY_HELMET : CONFIG.COLORS.PLAYER_HELMET;
        
        // Crumpled heap
        ctx.fillStyle = '#2a2a1a';
        ctx.fillRect(-3, 3, 8, 3);
        
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Helmet visible
        ctx.fillStyle = helmetColor;
        ctx.beginPath();
        ctx.ellipse(-2, -3, 3, 2, 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawUnit(ctx, isEnemy) {
        // Classic Cannon Fodder style - tiny pixelated soldiers with WWI details
        const isMoving = this.state === UnitState.MOVING || this.state === UnitState.CHARGING;
        const isFighting = this.state === UnitState.FIGHTING;
        const legSpeed = this.state === UnitState.CHARGING ? 20 : 15;
        const legOffset = isMoving ? Math.sin(this.animTime * legSpeed) * 3 : 0;
        
        // Shadow - darker and more defined
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(0, 6, 5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        if (this.type === 'soldier') {
            this.drawSoldier(ctx, isEnemy, isMoving, isFighting, legOffset);
        } else if (this.type === 'worker') {
            this.drawWorker(ctx, isMoving, legOffset);
        }
    }
    
    drawSoldier(ctx, isEnemy, isMoving, isFighting, legOffset) {
        const bodyColor = isEnemy ? CONFIG.COLORS.ENEMY_BODY : CONFIG.COLORS.PLAYER_BODY;
        const bodyDark = isEnemy ? CONFIG.COLORS.ENEMY_BODY_DARK : CONFIG.COLORS.PLAYER_BODY_DARK;
        const skinColor = isEnemy ? CONFIG.COLORS.ENEMY_SKIN : CONFIG.COLORS.PLAYER_SKIN;
        const helmetColor = isEnemy ? CONFIG.COLORS.ENEMY_HELMET : CONFIG.COLORS.PLAYER_HELMET;
        const webbingColor = CONFIG.COLORS.PLAYER_WEBBING;
        
        // Legs (dark, animated when moving)
        ctx.fillStyle = '#2a2a1a';
        if (isMoving) {
            // Animated running legs
            ctx.fillRect(-3 + legOffset, 3, 3, 5);
            ctx.fillRect(1 - legOffset, 3, 3, 5);
            // Boots
            ctx.fillStyle = '#1a1a0a';
            ctx.fillRect(-3 + legOffset, 6, 3, 2);
            ctx.fillRect(1 - legOffset, 6, 3, 2);
        } else {
            ctx.fillRect(-3, 3, 3, 4);
            ctx.fillRect(1, 3, 3, 4);
            // Boots
            ctx.fillStyle = '#1a1a0a';
            ctx.fillRect(-3, 5, 3, 2);
            ctx.fillRect(1, 5, 3, 2);
        }
        
        // Body/tunic
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-4, -3, 9, 7);
        
        // Darker side for depth
        ctx.fillStyle = bodyDark;
        ctx.fillRect(-4, -3, 2, 7);
        
        // Belt/webbing
        ctx.fillStyle = webbingColor;
        ctx.fillRect(-4, 1, 9, 2);
        // Cross strap
        ctx.fillRect(this.facing > 0 ? -4 : 2, -3, 2, 6);
        
        // Ammo pouches
        ctx.fillStyle = '#4a4030';
        ctx.fillRect(-4, 0, 2, 3);
        ctx.fillRect(3, 0, 2, 3);
        
        // Arms
        const armAngle = isFighting ? Math.sin(this.animTime * 10) * 0.1 : 0;
        ctx.save();
        ctx.rotate(armAngle);
        ctx.fillStyle = bodyColor;
        if (this.facing > 0) {
            ctx.fillRect(4, -2, 3, 4);
        } else {
            ctx.fillRect(-6, -2, 3, 4);
        }
        ctx.restore();
        
        // Head (skin)
        ctx.fillStyle = skinColor;
        ctx.fillRect(-2, -7, 5, 5);
        
        // Eyes
        ctx.fillStyle = '#2a1a0a';
        ctx.fillRect(this.facing > 0 ? 1 : -1, -5, 1, 1);
        
        // Helmet - different styles for each team
        if (isEnemy) {
            // German Stahlhelm (M1916)
            ctx.fillStyle = helmetColor;
            ctx.fillRect(-3, -9, 7, 3);
            ctx.fillRect(-4, -8, 9, 2);
            // Distinctive rim
            ctx.fillStyle = '#3a3a30';
            ctx.fillRect(-4, -7, 9, 1);
            // Front plate detail
            ctx.fillStyle = '#5a5a4a';
            ctx.fillRect(0, -9, 2, 2);
        } else {
            // British Brodie helmet
            ctx.fillStyle = helmetColor;
            ctx.fillRect(-3, -9, 7, 3);
            // Wide brim
            ctx.fillRect(-5, -7, 11, 2);
            // Rim highlight
            ctx.fillStyle = '#5a6a4a';
            ctx.fillRect(-4, -8, 9, 1);
        }
        
        // Rifle
        const rifleRecoil = (this.attackCooldown > 0.8 / this.attackRate) ? -2 : 0;
        ctx.fillStyle = '#3d2b1f'; // Wood stock
        const gunX = this.facing > 0 ? 5 + rifleRecoil : -9 - rifleRecoil;
        ctx.fillRect(gunX, -2, 7, 3);
        // Metal barrel
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(this.facing > 0 ? gunX + 5 : gunX - 2, -1, 4, 2);
        // Bayonet
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(this.facing > 0 ? gunX + 8 : gunX - 4, 0, 3, 1);
        
        // Muzzle flash when shooting
        if (this.attackCooldown > 0.85 / this.attackRate) {
            const flashX = this.facing > 0 ? gunX + 10 : gunX - 5;
            // Bright core
            ctx.fillStyle = CONFIG.COLORS.MUZZLE_CORE;
            ctx.fillRect(flashX, -1, 3, 2);
            // Orange flash
            ctx.fillStyle = CONFIG.COLORS.MUZZLE_FLASH;
            ctx.fillRect(flashX - 1, -2, 5, 4);
            // Smoke puff
            ctx.fillStyle = 'rgba(100, 90, 70, 0.6)';
            ctx.fillRect(flashX + 2, -3, 4, 3);
        }
    }
    
    drawWorker(ctx, isMoving, legOffset) {
        const bodyColor = '#5a5040';
        const skinColor = CONFIG.COLORS.PLAYER_SKIN;
        const isHauling = this.shellsCarrying > 0;
        const workAnim = this.state === UnitState.WORKING ? Math.sin(this.animTime * 12) * 3 : legOffset;
        
        // Legs
        ctx.fillStyle = '#3a3020';
        if (isMoving || this.state === UnitState.WORKING) {
            ctx.fillRect(-3 + workAnim, 3, 3, 4);
            ctx.fillRect(1 - workAnim, 3, 3, 4);
        } else {
            ctx.fillRect(-3, 3, 3, 4);
            ctx.fillRect(1, 3, 3, 4);
        }
        // Boots
        ctx.fillStyle = '#2a2010';
        ctx.fillRect(-3, 5, 3, 2);
        ctx.fillRect(1, 5, 3, 2);
        
        // Body - worker's tunic
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-4, -2, 9, 6);
        
        // Suspenders
        ctx.fillStyle = '#4a4030';
        ctx.fillRect(-3, -2, 2, 5);
        ctx.fillRect(2, -2, 2, 5);
        
        // Arms
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-6, -1, 3, 3);
        ctx.fillRect(4, -1, 3, 3);
        
        // Hands
        ctx.fillStyle = skinColor;
        ctx.fillRect(-6, 1, 2, 2);
        ctx.fillRect(5, 1, 2, 2);
        
        // Head
        ctx.fillStyle = skinColor;
        ctx.fillRect(-2, -6, 5, 5);
        
        // Simple face
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(0, -4, 1, 1);
        
        // Flat cap
        ctx.fillStyle = '#3a3020';
        ctx.fillRect(-3, -7, 7, 2);
        // Cap brim
        ctx.fillRect(-4, -6, 9, 1);
        ctx.fillStyle = '#4a4030';
        ctx.fillRect(-2, -8, 5, 2);
        
        // Shell crate on back when hauling
        if (isHauling) {
            ctx.save();
            // Crate/box on back
            ctx.fillStyle = '#4a3a20';
            ctx.fillRect(-7, -4, 8, 8);
            // Crate detail
            ctx.strokeStyle = '#3a2a10';
            ctx.lineWidth = 1;
            ctx.strokeRect(-7, -4, 8, 8);
            // Cross straps
            ctx.strokeStyle = '#5a4a30';
            ctx.beginPath();
            ctx.moveTo(-7, -4);
            ctx.lineTo(1, 4);
            ctx.moveTo(1, -4);
            ctx.lineTo(-7, 4);
            ctx.stroke();
            // Shell tips visible
            ctx.fillStyle = '#6a6a5a';
            for (let i = 0; i < Math.min(3, this.shellsCarrying); i++) {
                ctx.beginPath();
                ctx.arc(-5 + i * 2, -5, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        
        // Shovel/tool (only show if not hauling)
        if (!isHauling) {
            const shovelAngle = this.state === UnitState.WORKING ? 
                Math.sin(this.animTime * 10) * 0.8 : 0.3;
            ctx.save();
            ctx.translate(5, 0);
            ctx.rotate(shovelAngle);
            // Handle
            ctx.fillStyle = '#4a3a2a';
            ctx.fillRect(-1, -4, 3, 14);
            // Blade
            ctx.fillStyle = '#6a6a6a';
            ctx.beginPath();
            ctx.moveTo(-2, 8);
            ctx.lineTo(4, 8);
            ctx.lineTo(3, 14);
            ctx.lineTo(-1, 14);
            ctx.closePath();
            ctx.fill();
            // Blade edge highlight
            ctx.fillStyle = '#8a8a8a';
            ctx.fillRect(-1, 8, 4, 1);
            ctx.restore();
        }
        
        // Digging effect when working
        if (this.state === UnitState.WORKING && Math.sin(this.animTime * 10) > 0.5) {
            ctx.fillStyle = CONFIG.COLORS.MUD;
            for (let i = 0; i < 3; i++) {
                const px = 8 + Math.random() * 6;
                const py = 2 + Math.random() * 4;
                ctx.fillRect(px, py, 2, 2);
            }
        }
    }
}

