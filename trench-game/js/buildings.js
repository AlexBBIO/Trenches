// Buildings Module - Emplacements, artillery, HQ, barbed wire
import { CONFIG } from './game.js';

export class BuildingManager {
    constructor(game) {
        this.game = game;
        this.buildings = [];
        this.barbedWireLines = []; // Line-based barbed wire
        this.buildingIdCounter = 0;
        this.claimedBuildings = new Map(); // buildingId -> workerId
        this.claimedWireSegments = new Map(); // "wireId-segIdx" -> workerId
        this.claimedRepairs = new Map(); // buildingId -> workerId (for repair tasks)
        this.claimedArtillery = new Map(); // artilleryId -> workerId (for shell hauling)
    }
    
    clear() {
        this.buildings = [];
        this.barbedWireLines = [];
        // Create HQs for both teams
        this.createHQ(CONFIG.TEAM_PLAYER);
        this.createHQ(CONFIG.TEAM_ENEMY);
    }
    
    createHQ(team) {
        const x = team === CONFIG.TEAM_PLAYER ? 100 : CONFIG.MAP_WIDTH - 100;
        const y = CONFIG.MAP_HEIGHT / 2;
        
        this.buildings.push({
            id: this.buildingIdCounter++,
            type: 'hq',
            x,
            y,
            team,
            health: 500,
            maxHealth: 500,
            destroyed: false,
            radius: 50,
            isBlueprint: false,
            buildProgress: 1
        });
    }
    
    createBuilding(type, x, y, team, isBlueprint = true) {
        const building = {
            id: this.buildingIdCounter++,
            type,
            x,
            y,
            team,
            destroyed: false,
            angle: team === CONFIG.TEAM_PLAYER ? 0 : Math.PI,
            attackCooldown: 0,
            target: null,
            isBlueprint,
            buildProgress: isBlueprint ? 0 : 1,
            assignedUnit: null, // Soldier manning this
            needsManning: false
        };
        
        switch (type) {
            case 'machinegun':
                building.health = 150;
                building.maxHealth = 150;
                building.radius = 25;
                building.range = CONFIG.MG_RANGE;
                building.damage = 15;
                building.fireRate = 8;
                building.buildTime = 60; // Build points needed
                building.needsManning = true;
                break;
            case 'artillery':
                building.health = 100;
                building.maxHealth = 100;
                building.radius = 35;
                building.range = CONFIG.ARTILLERY_RANGE;
                building.damage = 80;
                building.splashRadius = 50;
                building.fireRate = 0.15;
                building.buildTime = 100;
                building.needsManning = true;
                building.maxAmmo = 10;      // Max shells artillery can hold
                // Enemy artillery starts with ammo, player needs to supply
                building.ammoCount = (team === CONFIG.TEAM_ENEMY) ? 5 : 0;
                break;
            case 'medical_tent':
                building.health = 120;
                building.maxHealth = 120;
                building.radius = 30;
                building.healRange = CONFIG.MEDICAL_TENT_HEAL_RANGE;
                building.healRate = CONFIG.MEDICAL_TENT_HEAL_RATE;
                building.buildTime = 50;
                building.needsManning = false;
                building.patientsHealing = []; // Units currently being healed
                break;
            case 'bunker':
                building.health = 300;
                building.maxHealth = 300;
                building.radius = 35;
                building.capacity = CONFIG.BUNKER_CAPACITY;
                building.occupants = []; // Soldiers inside the bunker
                building.protection = CONFIG.BUNKER_PROTECTION;
                building.buildTime = 80;
                building.needsManning = false;
                building.attackCooldown = 0;
                building.range = CONFIG.RIFLE_RANGE;
                break;
            case 'observation_post':
                building.health = 80;
                building.maxHealth = 80;
                building.radius = 20;
                building.visionRange = CONFIG.VISION_OBSERVATION_POST;
                building.buildTime = 40;
                building.needsManning = true;
                break;
            case 'supply_depot':
                building.health = 150;
                building.maxHealth = 150;
                building.radius = 35;
                building.shellStorage = 0; // Current shells stored
                building.maxShellStorage = CONFIG.SUPPLY_DEPOT_SHELL_BONUS;
                building.regenBonus = CONFIG.SUPPLY_DEPOT_REGEN_BONUS;
                building.buildTime = 60;
                building.needsManning = false;
                break;
            case 'mortar':
                building.health = 100;
                building.maxHealth = 100;
                building.radius = 25;
                building.range = CONFIG.MORTAR_RANGE;
                building.damage = CONFIG.MORTAR_DAMAGE;
                building.splashRadius = CONFIG.MORTAR_SPLASH;
                building.fireRate = CONFIG.MORTAR_FIRE_RATE;
                building.shellCost = CONFIG.MORTAR_SHELL_COST;
                building.buildTime = 50;
                building.needsManning = true;
                building.ammoCount = (team === CONFIG.TEAM_ENEMY) ? 5 : 0;
                building.maxAmmo = 10;
                break;
        }
        
        this.buildings.push(building);
        
        // Assign workers to build it
        if (isBlueprint) {
            this.assignWorkers(building);
        }
        
        return building;
    }
    
    // Barbed wire is now line-based like trenches
    createBarbedWireLine(points, team) {
        const wire = {
            id: this.buildingIdCounter++,
            type: 'barbed',
            points: points.map(p => ({ ...p })),
            team,
            isBlueprint: true,
            buildProgress: 0,
            segments: [],
            health: 100,
            maxHealth: 100,
            destroyed: false
        };
        
        // Calculate segments
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            wire.segments.push({
                start: p1,
                end: p2,
                length,
                progress: 0,
                built: false
            });
        }
        
        wire.totalLength = wire.segments.reduce((sum, s) => sum + s.length, 0);
        wire.buildTime = wire.totalLength / 2; // Build time based on length
        
        this.barbedWireLines.push(wire);
        this.assignWorkersToWire(wire);
        
        return wire;
    }
    
    assignWorkers(building) {
        const workers = this.game.unitManager.units.filter(
            u => u.type === 'worker' && u.team === building.team && u.state === 'idle' && !u.task
        );
        
        // Only assign one worker per building
        if (workers.length > 0) {
            const worker = workers[0];
            worker.assignTask({
                type: 'build_emplacement',
                building: building
            });
            // Claim the building
            this.claimBuilding(building.id, worker.id);
            // Start moving to the building
            worker.targetX = building.x;
            worker.targetY = building.y;
            worker.setState('moving');
        }
    }
    
    assignWorkersToWire(wire) {
        const workers = this.game.unitManager.units.filter(
            u => u.type === 'worker' && u.team === wire.team && u.state === 'idle' && !u.task
        );
        
        if (wire.segments.length === 0) return;
        
        // Assign workers to different segments
        let segIdx = 0;
        for (const worker of workers.slice(0, Math.min(workers.length, wire.segments.length))) {
            while (segIdx < wire.segments.length && wire.segments[segIdx].built) {
                segIdx++;
            }
            if (segIdx >= wire.segments.length) break;
            
            worker.assignTask({
                type: 'build_wire',
                wire: wire,
                segmentIndex: segIdx
            });
            // Claim this segment
            this.claimWireSegment(wire.id, segIdx, worker.id);
            // Start moving to the segment
            const seg = wire.segments[segIdx];
            worker.targetX = seg.start.x;
            worker.targetY = seg.start.y;
            worker.setState('moving');
            
            segIdx++;
        }
    }
    
    getHQ(team) {
        return this.buildings.find(b => b.type === 'hq' && b.team === team);
    }
    
    getUnmannedEmplacement(team, excludeTypes = []) {
        return this.buildings.find(b => 
            b.team === team && 
            !b.destroyed && 
            !b.isBlueprint &&
            b.needsManning && 
            !b.assignedUnit &&
            !excludeTypes.includes(b.type)
        );
    }
    
    // Get building at world position
    getBuildingAt(x, y) {
        // Check buildings from front to back (reverse order for click priority)
        for (let i = this.buildings.length - 1; i >= 0; i--) {
            const b = this.buildings[i];
            if (b.destroyed) continue;
            
            const dist = Math.sqrt((b.x - x) ** 2 + (b.y - y) ** 2);
            // Use building radius for click detection
            const clickRadius = b.radius || 30;
            if (dist <= clickRadius) {
                return b;
            }
        }
        return null;
    }
    
    // Get mortars needing ammo resupply
    getMortarsNeedingAmmo(team) {
        return this.buildings.filter(b => 
            b.team === team &&
            b.type === 'mortar' &&
            !b.destroyed &&
            !b.isBlueprint &&
            b.ammoCount < b.maxAmmo
        ).sort((a, b) => a.ammoCount - b.ammoCount);
    }
    
    // Find mortar needing resupply (respects claims)
    findMortarNeedingResupply(team, workerId = null) {
        const mortars = this.getMortarsNeedingAmmo(team);
        for (const mortar of mortars) {
            const claimedBy = this.claimedArtillery.get(mortar.id);
            if (claimedBy && claimedBy !== workerId) continue;
            
            if (mortar.ammoCount < mortar.maxAmmo * 0.7) {
                return mortar;
            }
        }
        return null;
    }
    
    // Find artillery that needs ammo (for shell hauling)
    getArtilleryNeedingAmmo(team) {
        return this.buildings.filter(b => 
            b.team === team &&
            b.type === 'artillery' &&
            !b.destroyed &&
            !b.isBlueprint &&
            b.ammoCount < b.maxAmmo
        ).sort((a, b) => a.ammoCount - b.ammoCount); // Prioritize lowest ammo first
    }
    
    // Get the artillery with lowest ammo that isn't being resupplied
    findArtilleryNeedingResupply(team, workerId = null) {
        const artillery = this.getArtilleryNeedingAmmo(team);
        for (const art of artillery) {
            // Check if claimed by another worker
            const claimedBy = this.claimedArtillery.get(art.id);
            if (claimedBy && claimedBy !== workerId) continue;
            
            if (art.ammoCount < art.maxAmmo * 0.7) {
                return art;
            }
        }
        return null;
    }
    
    // Claim artillery for resupply
    claimArtillery(artilleryId, workerId) {
        this.claimedArtillery.set(artilleryId, workerId);
    }
    
    // Unclaim artillery
    unclaimArtillery(artilleryId) {
        this.claimedArtillery.delete(artilleryId);
    }
    
    findNearestBuildSite(x, y, team, workerId = null) {
        let nearest = null;
        let minDist = Infinity;
        
        // Check buildings
        for (const building of this.buildings) {
            if (building.team !== team || !building.isBlueprint || building.destroyed) continue;
            
            // Check if claimed by another worker
            const claimedBy = this.claimedBuildings.get(building.id);
            if (claimedBy && claimedBy !== workerId) continue;
            
            const dist = Math.sqrt((building.x - x) ** 2 + (building.y - y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = { x: building.x, y: building.y, building, type: 'building' };
            }
        }
        
        // Check barbed wire
        for (const wire of this.barbedWireLines) {
            if (wire.team !== team || !wire.isBlueprint || wire.destroyed) continue;
            
            for (let i = 0; i < wire.segments.length; i++) {
                const seg = wire.segments[i];
                if (seg.built) continue;
                
                // Check if claimed by another worker
                const claimKey = `${wire.id}-${i}`;
                const claimedBy = this.claimedWireSegments.get(claimKey);
                if (claimedBy && claimedBy !== workerId) continue;
                
                const buildPoint = {
                    x: seg.start.x + (seg.end.x - seg.start.x) * seg.progress,
                    y: seg.start.y + (seg.end.y - seg.start.y) * seg.progress
                };
                
                const dist = Math.sqrt((buildPoint.x - x) ** 2 + (buildPoint.y - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { 
                        x: buildPoint.x, 
                        y: buildPoint.y, 
                        wire, 
                        segmentIndex: i,
                        type: 'wire' 
                    };
                }
            }
        }
        
        return nearest;
    }
    
    claimBuilding(buildingId, workerId) {
        this.claimedBuildings.set(buildingId, workerId);
    }
    
    unclaimBuilding(buildingId) {
        this.claimedBuildings.delete(buildingId);
    }
    
    claimWireSegment(wireId, segmentIndex, workerId) {
        const claimKey = `${wireId}-${segmentIndex}`;
        this.claimedWireSegments.set(claimKey, workerId);
    }
    
    unclaimWireSegment(wireId, segmentIndex) {
        const claimKey = `${wireId}-${segmentIndex}`;
        this.claimedWireSegments.delete(claimKey);
    }
    
    unclaimAllForWorker(workerId) {
        for (const [id, wid] of this.claimedBuildings.entries()) {
            if (wid === workerId) {
                this.claimedBuildings.delete(id);
            }
        }
        for (const [key, wid] of this.claimedWireSegments.entries()) {
            if (wid === workerId) {
                this.claimedWireSegments.delete(key);
            }
        }
        for (const [id, wid] of this.claimedRepairs.entries()) {
            if (wid === workerId) {
                this.claimedRepairs.delete(id);
            }
        }
        for (const [id, wid] of this.claimedArtillery.entries()) {
            if (wid === workerId) {
                this.claimedArtillery.delete(id);
            }
        }
    }
    
    buildBuilding(building, amount) {
        // Already built - return complete so worker moves on
        if (!building.isBlueprint) return true;
        
        building.buildProgress += amount / building.buildTime;
        
        if (building.buildProgress >= 1) {
            building.buildProgress = 1;
            building.isBlueprint = false;
            
            // Auto-assign soldiers to man it
            this.game.unitManager.reassignIdleSoldiers(building.team);
            
            return true; // Complete
        }
        return false;
    }
    
    buildWireSegment(wire, segmentIndex, amount) {
        if (segmentIndex >= wire.segments.length) return true;
        
        const segment = wire.segments[segmentIndex];
        
        // Already built - return complete immediately
        if (segment.built) return true;
        
        segment.progress += amount / segment.length;
        
        if (segment.progress >= 1) {
            segment.progress = 1;
            segment.built = true;
            return true; // Segment complete
        }
        return false;
    }
    
    isWireComplete(wire) {
        return wire.segments.every(s => s.built);
    }
    
    completeWire(wire) {
        wire.isBlueprint = false;
        wire.segments.forEach(s => {
            s.built = true;
            s.progress = 1;
        });
    }
    
    canPlace(type, x, y) {
        const margin = 50;
        if (x < margin || x > CONFIG.MAP_WIDTH - margin ||
            y < margin || y > CONFIG.MAP_HEIGHT - margin) {
            return false;
        }
        
        for (const building of this.buildings) {
            const dist = Math.sqrt((building.x - x) ** 2 + (building.y - y) ** 2);
            if (dist < building.radius + 40) {
                return false;
            }
        }
        
        // Artillery must be placed in player's side
        if (type === 'artillery') {
            if (x > CONFIG.MAP_WIDTH * 0.4) {
                return false;
            }
        }
        
        // Mortar can be placed further forward but not too far
        if (type === 'mortar') {
            if (x > CONFIG.MAP_WIDTH * 0.5) {
                return false;
            }
        }
        
        // Medical tent should be in safe area (behind lines)
        if (type === 'medical_tent') {
            if (x > CONFIG.MAP_WIDTH * 0.35) {
                return false;
            }
        }
        
        // Supply depot must be near HQ area
        if (type === 'supply_depot') {
            if (x > CONFIG.MAP_WIDTH * 0.3) {
                return false;
            }
        }
        
        // Bunker can be placed on front lines
        if (type === 'bunker') {
            if (x > CONFIG.MAP_WIDTH * 0.6) {
                return false;
            }
        }
        
        // Observation post can be placed forward
        if (type === 'observation_post') {
            if (x > CONFIG.MAP_WIDTH * 0.55) {
                return false;
            }
        }
        
        return true;
    }
    
    // Find damaged structures for repair (respects claims)
    findDamagedStructure(x, y, team, workerId = null) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const building of this.buildings) {
            if (building.team !== team || building.destroyed || building.isBlueprint) continue;
            if (building.health >= building.maxHealth) continue;
            
            // Check if claimed by another worker
            const claimedBy = this.claimedRepairs.get(building.id);
            if (claimedBy && claimedBy !== workerId) continue;
            
            const dist = Math.sqrt((building.x - x) ** 2 + (building.y - y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = {
                    type: 'building',
                    target: building,
                    x: building.x,
                    y: building.y
                };
            }
        }
        
        return nearest;
    }
    
    // Claim a building for repair
    claimRepair(buildingId, workerId) {
        this.claimedRepairs.set(buildingId, workerId);
    }
    
    // Unclaim a repair
    unclaimRepair(buildingId) {
        this.claimedRepairs.delete(buildingId);
    }
    
    // Repair a damaged building
    repairBuilding(building, amount) {
        if (building.destroyed || building.isBlueprint) return true;
        
        building.health = Math.min(building.maxHealth, building.health + amount);
        
        return building.health >= building.maxHealth;
    }
    
    update(dt) {
        // Update buildings
        for (const building of this.buildings) {
            if (building.destroyed) continue;
            if (building.isBlueprint) continue; // Not built yet
            
            if (building.attackCooldown > 0) {
                building.attackCooldown -= dt;
            }
            
            // Weapon buildings - only fire if manned!
            if ((building.type === 'machinegun' || building.type === 'artillery')) {
                if (building.assignedUnit && building.assignedUnit.state === 'dead') {
                    // Unit died, clear assignment
                    building.assignedUnit = null;
                }
                
                if (building.assignedUnit) {
                    this.updateWeapon(building, dt);
                }
            }
            
            // Medical Tent - heal nearby wounded units
            if (building.type === 'medical_tent') {
                this.updateMedicalTent(building, dt);
            }
            
            // Bunker - occupants can fire at enemies
            if (building.type === 'bunker') {
                this.updateBunker(building, dt);
            }
            
            // Observation Post - needs manning
            if (building.type === 'observation_post') {
                if (building.assignedUnit && building.assignedUnit.state === 'dead') {
                    building.assignedUnit = null;
                }
            }
            
            // Mortar - similar to artillery
            if (building.type === 'mortar') {
                if (building.assignedUnit && building.assignedUnit.state === 'dead') {
                    building.assignedUnit = null;
                }
                if (building.assignedUnit) {
                    this.updateMortar(building, dt);
                }
            }
        }
        
        // Update barbed wire effects
        for (const wire of this.barbedWireLines) {
            if (wire.destroyed || wire.isBlueprint) continue;
            this.updateBarbedWireEffect(wire);
        }
    }
    
    // Medical Tent logic - heal friendly units that are close
    updateMedicalTent(building, dt) {
        // Find all friendly units (soldiers and workers) that are wounded and close to the tent
        const nearbyWounded = this.game.unitManager.units.filter(u =>
            u.team === building.team &&
            u.state !== 'dead' &&
            u.health < u.maxHealth // Any damage counts
        );
        
        for (const unit of nearbyWounded) {
            const dist = Math.sqrt((unit.x - building.x) ** 2 + (unit.y - building.y) ** 2);
            
            // Heal units that are close to the tent (within radius + some buffer)
            if (dist < building.radius + 40) {
                unit.health = Math.min(unit.maxHealth, unit.health + building.healRate * dt);
                
                // Healing effect (green cross particles)
                if (Math.random() < dt * 2) {
                    this.game.addEffect('muzzle', unit.x, unit.y - 10, {
                        size: 6,
                        duration: 0.3
                    });
                }
                
                // Clear seeking flag once healed enough
                if (unit.health >= unit.maxHealth * 0.9) {
                    unit.seekingMedicalTent = null;
                }
            }
        }
    }
    
    // Bunker logic - occupants fire at enemies
    updateBunker(building, dt) {
        // Clean up dead occupants
        building.occupants = building.occupants.filter(u => u.state !== 'dead');
        
        if (building.occupants.length === 0) return;
        
        // Find enemies in range - player bunkers respect fog of war
        const enemies = building.team === CONFIG.TEAM_PLAYER
            ? this.game.unitManager.getVisibleEnemiesInRange(building.x, building.y, building.range, building.team)
            : this.game.unitManager.getEnemiesInRange(building.x, building.y, building.range, building.team);
        
        if (enemies.length === 0) return;
        
        // Each occupant can fire
        for (const occupant of building.occupants) {
            if (occupant.attackCooldown > 0) {
                occupant.attackCooldown -= dt;
                continue;
            }
            
            // Find closest enemy
            let closest = null;
            let closestDist = Infinity;
            for (const enemy of enemies) {
                const dist = Math.sqrt((enemy.x - building.x) ** 2 + (enemy.y - building.y) ** 2);
                if (dist < closestDist) {
                    closestDist = dist;
                    closest = enemy;
                }
            }
            
            if (closest && occupant.attackCooldown <= 0) {
                // Fire from bunker (slightly reduced accuracy)
                const angle = Math.atan2(closest.y - building.y, closest.x - building.x);
                this.game.addEffect('muzzle',
                    building.x + Math.cos(angle) * 25,
                    building.y + Math.sin(angle) * 25,
                    { size: 6, duration: 0.08 }
                );
                
                const hitChance = 0.5 - (closestDist / building.range) * 0.2; // Lower accuracy from bunker
                if (Math.random() < hitChance) {
                    this.game.combatSystem.dealDamage(closest, occupant.attackDamage, occupant);
                }
                
                occupant.attackCooldown = 1 / occupant.attackRate;
            }
        }
    }
    
    // Mortar logic - fires at enemies with fractional shell cost
    updateMortar(building, dt) {
        // Player buildings respect fog of war - only target visible enemies
        const enemies = building.team === CONFIG.TEAM_PLAYER
            ? this.game.unitManager.getVisibleEnemiesInRange(building.x, building.y, building.range, building.team)
            : this.game.unitManager.getEnemiesInRange(building.x, building.y, building.range, building.team);
        
        if (enemies.length === 0) {
            building.target = null;
            return;
        }
        
        // Find closest target
        let target = null;
        let minDist = Infinity;
        for (const enemy of enemies) {
            const dist = Math.sqrt((enemy.x - building.x) ** 2 + (enemy.y - building.y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                target = enemy;
            }
        }
        
        building.target = target;
        
        if (target) {
            const targetAngle = Math.atan2(target.y - building.y, target.x - building.x);
            const angleDiff = targetAngle - building.angle;
            building.angle += angleDiff * 5 * dt;
        }
        
        if (target && building.attackCooldown <= 0) {
            // Check ammo - uses fractional shells
            if (building.ammoCount >= building.shellCost) {
                building.ammoCount -= building.shellCost;
                this.fireMortar(building, target);
                building.attackCooldown = 1 / building.fireRate;
            }
        }
    }
    
    fireMortar(building, target) {
        // Mortar has less spread than artillery
        const dist = Math.sqrt((target.x - building.x) ** 2 + (target.y - building.y) ** 2);
        const baseSpread = 30;
        const distanceSpread = (dist / CONFIG.MORTAR_RANGE) * 40;
        const totalSpread = baseSpread + distanceSpread;
        
        const spreadAngle = Math.random() * Math.PI * 2;
        const spreadDist = Math.random() * totalSpread;
        
        const targetX = target.x + Math.cos(spreadAngle) * spreadDist;
        const targetY = target.y + Math.sin(spreadAngle) * spreadDist;
        
        // Muzzle flash
        this.game.addEffect('muzzle',
            building.x,
            building.y - 10,
            { size: 20, duration: 0.15 }
        );
        
        // Shorter flight time than artillery
        const flightTime = 400 + (dist / CONFIG.MORTAR_RANGE) * 300;
        
        setTimeout(() => {
            this.mortarExplosion(targetX, targetY, building);
        }, flightTime);
    }
    
    mortarExplosion(x, y, source) {
        this.game.addEffect('explosion', x, y, {
            size: 25,
            duration: 0.5
        });
        
        const splashRadius = source.splashRadius || 35;
        const allUnits = this.game.unitManager.units;
        
        for (const unit of allUnits) {
            const dist = Math.sqrt((unit.x - x) ** 2 + (unit.y - y) ** 2);
            if (dist < splashRadius) {
                const falloff = 1 - (dist / splashRadius);
                const damage = source.damage * falloff;
                this.game.combatSystem.dealDamage(unit, damage, source);
                unit.suppression = Math.min(100, unit.suppression + 60);
            }
        }
    }
    
    // Get Supply Depot bonus for supply regeneration
    getSupplyRegenBonus(team) {
        let bonus = 0;
        for (const building of this.buildings) {
            if (building.type === 'supply_depot' &&
                building.team === team &&
                !building.destroyed &&
                !building.isBlueprint) {
                bonus += building.regenBonus;
            }
        }
        return bonus;
    }
    
    // Get total shell storage from Supply Depots
    getTotalShellStorage(team) {
        let storage = CONFIG.MAX_SHELLS;
        for (const building of this.buildings) {
            if (building.type === 'supply_depot' &&
                building.team === team &&
                !building.destroyed &&
                !building.isBlueprint) {
                storage += building.maxShellStorage;
            }
        }
        return storage;
    }
    
    // Enter a bunker
    enterBunker(unit, bunker) {
        if (bunker.occupants.length >= bunker.capacity) return false;
        if (bunker.destroyed || bunker.isBlueprint) return false;
        
        bunker.occupants.push(unit);
        unit.inBunker = bunker;
        unit.visible = false; // Hide the unit visually
        return true;
    }
    
    // Exit a bunker
    exitBunker(unit) {
        if (!unit.inBunker) return;
        
        const bunker = unit.inBunker;
        const idx = bunker.occupants.indexOf(unit);
        if (idx !== -1) {
            bunker.occupants.splice(idx, 1);
        }
        
        // Place unit near bunker exit
        unit.x = bunker.x + (Math.random() - 0.5) * 40;
        unit.y = bunker.y + bunker.radius + 10;
        unit.inBunker = null;
        unit.visible = true;
    }
    
    // Find bunker with space
    findAvailableBunker(team) {
        return this.buildings.find(b =>
            b.type === 'bunker' &&
            b.team === team &&
            !b.destroyed &&
            !b.isBlueprint &&
            b.occupants.length < b.capacity
        );
    }
    
    updateWeapon(building, dt) {
        // Player buildings respect fog of war - only target visible enemies
        const enemies = building.team === CONFIG.TEAM_PLAYER
            ? this.game.unitManager.getVisibleEnemiesInRange(building.x, building.y, building.range, building.team)
            : this.game.unitManager.getEnemiesInRange(building.x, building.y, building.range, building.team);
        
        if (enemies.length === 0) {
            building.target = null;
            return;
        }
        
        let target = null;
        let minDist = Infinity;
        
        for (const enemy of enemies) {
            const dist = Math.sqrt((enemy.x - building.x) ** 2 + (enemy.y - building.y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                target = enemy;
            }
        }
        
        building.target = target;
        
        if (target) {
            const targetAngle = Math.atan2(target.y - building.y, target.x - building.x);
            const angleDiff = targetAngle - building.angle;
            building.angle += angleDiff * 5 * dt;
        }
        
        if (target && building.attackCooldown <= 0) {
            // Artillery needs ammo to fire
            if (building.type === 'artillery') {
                if (building.ammoCount > 0) {
                    building.ammoCount--;
                    this.fire(building, target);
                    building.attackCooldown = 1 / building.fireRate;
                }
                // No ammo - can't fire
            } else {
                this.fire(building, target);
                building.attackCooldown = 1 / building.fireRate;
            }
        }
    }
    
    fire(building, target) {
        if (building.type === 'machinegun') {
            this.game.addEffect('muzzle',
                building.x + Math.cos(building.angle) * 25,
                building.y + Math.sin(building.angle) * 25,
                { size: 10, duration: 0.05 }
            );
            
            const dist = Math.sqrt((target.x - building.x) ** 2 + (target.y - building.y) ** 2);
            const hitChance = 0.8 - (dist / building.range) * 0.3;
            
            if (Math.random() < hitChance) {
                this.game.combatSystem.dealDamage(target, building.damage, building);
            }
            
            const nearbyEnemies = this.game.unitManager.getEnemiesInRange(
                target.x, target.y, 50, building.team
            );
            nearbyEnemies.forEach(e => {
                e.suppression = Math.min(100, e.suppression + 10);
            });
            
        } else if (building.type === 'artillery') {
            // Artillery has significant spread that increases with distance
            const dist = Math.sqrt((target.x - building.x) ** 2 + (target.y - building.y) ** 2);
            
            // Base spread of 60, plus additional spread based on distance (up to +100 at max range)
            const baseSpread = 60;
            const distanceSpread = (dist / CONFIG.ARTILLERY_RANGE) * 100;
            const totalSpread = baseSpread + distanceSpread;
            
            // Random angle and distance for the impact point
            const spreadAngle = Math.random() * Math.PI * 2;
            const spreadDist = Math.random() * totalSpread;
            
            const targetX = target.x + Math.cos(spreadAngle) * spreadDist;
            const targetY = target.y + Math.sin(spreadAngle) * spreadDist;
            
            this.game.addEffect('muzzle',
                building.x + Math.cos(building.angle) * 35,
                building.y + Math.sin(building.angle) * 35,
                { size: 30, duration: 0.2 }
            );
            
            // Shell flight time varies with distance (0.8s to 1.5s)
            const flightTime = 800 + (dist / CONFIG.ARTILLERY_RANGE) * 700;
            
            setTimeout(() => {
                this.artilleryExplosion(targetX, targetY, building);
            }, flightTime);
        }
    }
    
    artilleryExplosion(x, y, source) {
        this.game.addEffect('explosion', x, y, {
            size: 40,
            duration: 0.6
        });
        
        const splashRadius = source.splashRadius || 50;
        const allUnits = this.game.unitManager.units;
        
        for (const unit of allUnits) {
            const dist = Math.sqrt((unit.x - x) ** 2 + (unit.y - y) ** 2);
            if (dist < splashRadius) {
                const falloff = 1 - (dist / splashRadius);
                const damage = source.damage * falloff;
                this.game.combatSystem.dealDamage(unit, damage, source);
                unit.suppression = 100;
            }
        }
        
        for (const building of this.buildings) {
            if (building === source || building.destroyed) continue;
            
            const dist = Math.sqrt((building.x - x) ** 2 + (building.y - y) ** 2);
            if (dist < splashRadius) {
                const falloff = 1 - (dist / splashRadius);
                building.health -= source.damage * falloff * 0.5;
                
                if (building.health <= 0) {
                    building.destroyed = true;
                    if (building.assignedUnit) {
                        building.assignedUnit.mannedBuilding = null;
                        building.assignedUnit = null;
                    }
                    this.game.addEffect('explosion', building.x, building.y, {
                        size: 50,
                        duration: 0.8
                    });
                }
            }
        }
    }
    
    updateBarbedWireEffect(wire) {
        const enemyTeam = wire.team === CONFIG.TEAM_PLAYER ? CONFIG.TEAM_ENEMY : CONFIG.TEAM_PLAYER;
        
        // Check each segment
        for (const seg of wire.segments) {
            if (!seg.built) continue;
            
            // Get units near this segment
            const midX = (seg.start.x + seg.end.x) / 2;
            const midY = (seg.start.y + seg.end.y) / 2;
            
            const nearby = this.game.unitManager.getUnitsInRange(midX, midY, seg.length / 2 + 10, enemyTeam);
            
            for (const unit of nearby) {
                // Check if unit is close to the wire line
                const dist = this.pointToSegmentDistance(unit.x, unit.y, seg.start, seg.end);
                if (dist < 15) {
                    unit.speed = unit.speed * 0.3; // Heavy slow
                    if (Math.random() < 0.05) {
                        unit.takeDamage(3, wire);
                    }
                }
            }
        }
    }
    
    pointToSegmentDistance(px, py, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq === 0) return Math.sqrt((px - a.x) ** 2 + (py - a.y) ** 2);
        
        let t = ((px - a.x) * dx + (py - a.y) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        
        const nearestX = a.x + t * dx;
        const nearestY = a.y + t * dy;
        
        return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
    }
    
    takeDamage(building, amount) {
        building.health -= amount;
        
        if (building.health <= 0) {
            building.destroyed = true;
            
            // Clear assigned unit
            if (building.assignedUnit) {
                building.assignedUnit.mannedBuilding = null;
                building.assignedUnit = null;
            }
            
            // Eject all bunker occupants (they take damage from explosion)
            if (building.type === 'bunker' && building.occupants) {
                for (const occupant of [...building.occupants]) {
                    this.exitBunker(occupant);
                    // Occupants take damage when bunker is destroyed
                    if (occupant.state !== 'dead') {
                        this.game.combatSystem.dealDamage(occupant, 30, building);
                    }
                }
                building.occupants = [];
            }
            
            this.game.addEffect('explosion', building.x, building.y, {
                size: building.type === 'hq' ? 80 : (building.type === 'bunker' ? 60 : 40),
                duration: 0.8
            });
        }
    }
    
    render(ctx, renderer = null) {
        // Render barbed wire lines
        for (const wire of this.barbedWireLines) {
            if (wire.destroyed) continue;
            // Hide enemy wire in fog - only show if currently visible
            if (renderer && wire.team === CONFIG.TEAM_ENEMY) {
                const midX = wire.points.length > 0 ? wire.points[0].x : 0;
                const midY = wire.points.length > 0 ? wire.points[0].y : 0;
                if (!renderer.isPositionVisible(midX, midY)) continue;
            }
            this.renderBarbedWireLine(ctx, wire);
        }
        
        // Render buildings - sort by y for proper overlap
        const sortedBuildings = [...this.buildings].sort((a, b) => a.y - b.y);
        for (const building of sortedBuildings) {
            // Hide enemy buildings in fog of war (except HQ which is always visible)
            // Enemy buildings only visible when currently in vision, not just explored
            if (renderer && building.team === CONFIG.TEAM_ENEMY && building.type !== 'hq') {
                if (!renderer.isPositionVisible(building.x, building.y)) {
                    continue; // Don't render enemy buildings not currently visible
                }
            }
            
            if (building.destroyed) {
                this.renderDestroyed(ctx, building);
                continue;
            }
            
            switch (building.type) {
                case 'hq':
                    this.renderHQ(ctx, building);
                    break;
                case 'machinegun':
                    this.renderMachineGun(ctx, building);
                    break;
                case 'artillery':
                    this.renderArtillery(ctx, building);
                    break;
                case 'medical_tent':
                    this.renderMedicalTent(ctx, building);
                    break;
                case 'bunker':
                    this.renderBunker(ctx, building);
                    break;
                case 'observation_post':
                    this.renderObservationPost(ctx, building);
                    break;
                case 'supply_depot':
                    this.renderSupplyDepot(ctx, building);
                    break;
                case 'mortar':
                    this.renderMortar(ctx, building);
                    break;
            }
            
            // Render selection highlight if selected
            if (building.selected) {
                this.renderSelectionHighlight(ctx, building);
            }
        }
    }
    
    // Render selection highlight around a building
    renderSelectionHighlight(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        const radius = (building.radius || 30) + 10;
        
        // Animated dashed circle
        ctx.strokeStyle = '#d4a030';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -performance.now() / 50; // Animate dash
        
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Glow effect
        ctx.shadowColor = '#d4a030';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = 'rgba(212, 160, 48, 0.5)';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(0, 0, radius - 2, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
    
    renderBarbedWireLine(ctx, wire) {
        for (const seg of wire.segments) {
            const start = seg.start;
            const end = seg.built ? seg.end : {
                x: start.x + (seg.end.x - start.x) * seg.progress,
                y: start.y + (seg.end.y - start.y) * seg.progress
            };
            
            if (seg.progress === 0 && !seg.built) {
                // Unbuilt - show blueprint with dashed line
                ctx.strokeStyle = 'rgba(90, 70, 50, 0.5)';
                ctx.lineWidth = 10;
                ctx.setLineDash([8, 8]);
                ctx.beginPath();
                ctx.moveTo(seg.start.x, seg.start.y);
                ctx.lineTo(seg.end.x, seg.end.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            
            if (seg.progress > 0 || seg.built) {
                // Draw built portion
                this.drawBarbedWireSegment(ctx, start, end);
            }
        }
    }
    
    drawBarbedWireSegment(ctx, start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 1) return;
        
        const nx = -dy / length;
        const ny = dx / length;
        
        // Shadow underneath
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.moveTo(start.x + nx * 8 + 3, start.y + ny * 8 + 3);
        ctx.lineTo(end.x + nx * 8 + 3, end.y + ny * 8 + 3);
        ctx.lineTo(end.x - nx * 8 + 3, end.y - ny * 8 + 3);
        ctx.lineTo(start.x - nx * 8 + 3, start.y - ny * 8 + 3);
        ctx.closePath();
        ctx.fill();
        
        // Wooden posts with detail
        const postCount = Math.max(2, Math.floor(length / 35));
        for (let i = 0; i <= postCount; i++) {
            const t = i / postCount;
            const px = start.x + dx * t;
            const py = start.y + dy * t;
            
            // Post shadow
            ctx.fillStyle = CONFIG.COLORS.SHADOW;
            ctx.fillRect(px - 1, py + 10, 4, 3);
            
            // Main post
            ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
            ctx.fillRect(px - 2, py - 12, 5, 22);
            
            // Post highlight
            ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK_LIGHT;
            ctx.fillRect(px - 1, py - 10, 2, 18);
            
            // Cross piece
            ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
            ctx.fillRect(px - 6, py - 8, 13, 3);
            ctx.fillRect(px - 6, py + 2, 13, 3);
        }
        
        // Multiple wire strands
        for (let row = -2; row <= 2; row++) {
            const offset = row * 4;
            
            // Main wire - slightly wavy
            ctx.strokeStyle = CONFIG.COLORS.BARBED_WIRE;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(start.x + nx * offset, start.y + ny * offset);
            
            // Add slight waviness
            const segments = Math.floor(length / 10);
            for (let s = 1; s <= segments; s++) {
                const t = s / segments;
                const wave = Math.sin(s * 2 + row) * 1.5;
                ctx.lineTo(
                    start.x + dx * t + nx * (offset + wave),
                    start.y + dy * t + ny * (offset + wave)
                );
            }
            ctx.stroke();
        }
        
        // Barbs - rusty metal crosses
        const barbCount = Math.floor(length / 6);
        for (let i = 0; i < barbCount; i++) {
            const t = (i + 0.5) / barbCount;
            const row = (i % 5) - 2;
            const bx = start.x + dx * t + nx * row * 4;
            const by = start.y + dy * t + ny * row * 4;
            
            ctx.fillStyle = CONFIG.COLORS.BARBED_WIRE_RUST;
            // X barbs
            ctx.fillRect(bx - 2, by - 2, 1, 4);
            ctx.fillRect(bx + 1, by - 2, 1, 4);
            ctx.fillRect(bx - 2, by - 1, 4, 1);
            ctx.fillRect(bx - 2, by + 1, 4, 1);
        }
    }
    
    renderHQ(ctx, building) {
        const isEnemy = building.team === CONFIG.TEAM_ENEMY;
        
        ctx.save();
        ctx.translate(building.x, building.y);
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(5, 35, 50, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Main building - WWI style dugout/bunker
        const baseColor = isEnemy ? '#4a3525' : '#354a35';
        const roofColor = isEnemy ? '#3a2515' : '#253a25';
        const trimColor = isEnemy ? '#5a4535' : '#455a45';
        
        // Base structure
        ctx.fillStyle = baseColor;
        ctx.fillRect(-45, -25, 90, 55);
        
        // Darker foundation
        ctx.fillStyle = CONFIG.COLORS.MUD_DARK;
        ctx.fillRect(-48, 25, 96, 10);
        
        // Wall detail - horizontal planks/sandbags
        ctx.fillStyle = trimColor;
        for (let y = -20; y < 25; y += 8) {
            ctx.fillRect(-43, y, 86, 3);
        }
        
        // Darker left side for depth
        ctx.fillStyle = roofColor;
        ctx.fillRect(-45, -25, 15, 55);
        
        // Roof
        ctx.fillStyle = roofColor;
        ctx.beginPath();
        ctx.moveTo(-50, -25);
        ctx.lineTo(0, -55);
        ctx.lineTo(50, -25);
        ctx.closePath();
        ctx.fill();
        
        // Roof highlight
        ctx.fillStyle = trimColor;
        ctx.beginPath();
        ctx.moveTo(-40, -27);
        ctx.lineTo(0, -50);
        ctx.lineTo(40, -27);
        ctx.lineTo(35, -27);
        ctx.lineTo(0, -45);
        ctx.lineTo(-35, -27);
        ctx.closePath();
        ctx.fill();
        
        // Door
        ctx.fillStyle = '#1a1a0a';
        ctx.fillRect(-12, 0, 24, 30);
        ctx.fillStyle = '#2a2a1a';
        ctx.fillRect(-10, 2, 20, 26);
        // Door frame
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.fillRect(-14, -2, 4, 34);
        ctx.fillRect(10, -2, 4, 34);
        ctx.fillRect(-14, -2, 28, 4);
        
        // Windows
        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(-38, -10, 15, 12);
        ctx.fillRect(23, -10, 15, 12);
        // Window frames
        ctx.strokeStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.lineWidth = 2;
        ctx.strokeRect(-38, -10, 15, 12);
        ctx.strokeRect(23, -10, 15, 12);
        // Window cross
        ctx.beginPath();
        ctx.moveTo(-30.5, -10);
        ctx.lineTo(-30.5, 2);
        ctx.moveTo(-38, -4);
        ctx.lineTo(-23, -4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(30.5, -10);
        ctx.lineTo(30.5, 2);
        ctx.moveTo(23, -4);
        ctx.lineTo(38, -4);
        ctx.stroke();
        
        // Flag pole
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.fillRect(-2, -55, 4, 45);
        
        // Flag
        const flagColor = isEnemy ? '#8b2020' : '#206020';
        const flagAccent = isEnemy ? '#aa3030' : '#308030';
        ctx.fillStyle = flagColor;
        ctx.beginPath();
        ctx.moveTo(2, -90);
        ctx.lineTo(35, -80);
        ctx.lineTo(35, -60);
        ctx.lineTo(2, -55);
        ctx.closePath();
        ctx.fill();
        
        // Flag detail
        ctx.fillStyle = flagAccent;
        ctx.fillRect(8, -78, 20, 5);
        ctx.fillRect(15, -85, 5, 25);
        
        // Flag wave effect
        ctx.strokeStyle = '#1a1a0a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(2, -90);
        ctx.lineTo(35, -80);
        ctx.lineTo(35, -60);
        ctx.lineTo(2, -55);
        ctx.stroke();
        
        // Sandbag fortification around base
        this.drawSandbagPile(ctx, -50, 20, 25, 3);
        this.drawSandbagPile(ctx, 30, 20, 20, 2);
        
        this.renderHealthBar(ctx, building, 70);
        
        ctx.restore();
    }
    
    drawSandbagPile(ctx, x, y, width, rows) {
        for (let row = 0; row < rows; row++) {
            const rowY = y - row * 6;
            const bags = Math.floor((width - row * 4) / 10);
            const startX = x + row * 2;
            
            for (let i = 0; i < bags; i++) {
                const bagX = startX + i * 10 + (row % 2) * 5;
                
                // Sandbag shadow
                ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
                ctx.beginPath();
                ctx.ellipse(bagX + 5, rowY + 2, 6, 4, 0, 0, Math.PI * 2);
                ctx.fill();
                
                // Sandbag
                ctx.fillStyle = CONFIG.COLORS.SANDBAG;
                ctx.beginPath();
                ctx.ellipse(bagX + 5, rowY, 6, 3.5, 0, 0, Math.PI * 2);
                ctx.fill();
                
                // Sandbag highlight
                ctx.fillStyle = '#9a8a6a';
                ctx.beginPath();
                ctx.ellipse(bagX + 4, rowY - 1, 3, 2, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    renderMachineGun(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        // Blueprint mode
        if (building.isBlueprint) {
            ctx.globalAlpha = 0.5;
        }
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(3, 15, 28, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Sandbag emplacement - layered sandbags
        // Outer ring
        for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
            const bx = Math.cos(angle) * 22;
            const by = Math.sin(angle) * 18;
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
            ctx.beginPath();
            ctx.ellipse(bx, by + 2, 8, 5, angle, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG;
            ctx.beginPath();
            ctx.ellipse(bx, by, 7, 4, angle, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Inner dark pit
        ctx.fillStyle = CONFIG.COLORS.TRENCH;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Duckboard floor
        ctx.fillStyle = CONFIG.COLORS.DUCKBOARD;
        ctx.fillRect(-8, -6, 16, 12);
        ctx.strokeStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.lineWidth = 1;
        for (let i = -6; i <= 6; i += 3) {
            ctx.beginPath();
            ctx.moveTo(-7, i);
            ctx.lineTo(7, i);
            ctx.stroke();
        }
        
        // Machine gun (only show if not blueprint)
        if (!building.isBlueprint) {
            ctx.save();
            ctx.rotate(building.angle);
            
            // Tripod legs
            ctx.strokeStyle = CONFIG.COLORS.METAL;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-8, -10);
            ctx.lineTo(0, 0);
            ctx.moveTo(-8, 10);
            ctx.lineTo(0, 0);
            ctx.moveTo(-12, 0);
            ctx.lineTo(0, 0);
            ctx.stroke();
            
            // Gun body
            ctx.fillStyle = '#4a4a4a';
            ctx.fillRect(-5, -6, 30, 12);
            
            // Cooling jacket (ribbed)
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(8, -5, 20, 10);
            for (let i = 0; i < 6; i++) {
                ctx.fillStyle = i % 2 === 0 ? '#4a4a4a' : '#3a3a3a';
                ctx.fillRect(10 + i * 3, -5, 2, 10);
            }
            
            // Barrel
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(25, -3, 15, 6);
            
            // Muzzle
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(40, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Ammo belt box
            ctx.fillStyle = '#3a3020';
            ctx.fillRect(-8, 4, 12, 8);
            
            // Spade grip handles
            ctx.fillStyle = '#3a2a1a';
            ctx.fillRect(-10, -4, 6, 3);
            ctx.fillRect(-10, 1, 6, 3);
            
            ctx.restore();
        }
        
        // Build progress bar
        if (building.isBlueprint) {
            ctx.globalAlpha = 1;
            const barWidth = 35;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(-barWidth/2 - 1, 32, barWidth + 2, 6);
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, 33, barWidth, 4);
            ctx.fillStyle = '#44aa44';
            ctx.fillRect(-barWidth/2, 33, barWidth * building.buildProgress, 4);
        } else if (!building.assignedUnit && building.needsManning) {
            // Show "needs crew" indicator - pulsing
            const pulse = 0.7 + Math.sin(Date.now() / 200) * 0.3;
            ctx.fillStyle = `rgba(170, 68, 68, ${pulse})`;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('NO CREW', 0, 38);
        }
        
        this.renderHealthBar(ctx, building, 35);
        
        ctx.restore();
    }
    
    renderArtillery(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        if (building.isBlueprint) {
            ctx.globalAlpha = 0.5;
        }
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(5, 25, 45, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Gun platform/base
        ctx.fillStyle = CONFIG.COLORS.DUCKBOARD;
        ctx.fillRect(-35, -5, 70, 25);
        
        // Platform planks detail
        ctx.strokeStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.lineWidth = 1;
        for (let x = -30; x <= 30; x += 8) {
            ctx.beginPath();
            ctx.moveTo(x, -5);
            ctx.lineTo(x, 20);
            ctx.stroke();
        }
        
        // Wheels - large wooden spoked wheels
        this.drawArtilleryWheel(ctx, -28, 15, 16);
        this.drawArtilleryWheel(ctx, 28, 15, 16);
        
        // Gun carriage
        ctx.fillStyle = '#4a4030';
        ctx.fillRect(-20, -8, 40, 18);
        
        // Trail (the back part that digs into ground)
        ctx.fillStyle = '#3a3020';
        ctx.beginPath();
        ctx.moveTo(-25, 5);
        ctx.lineTo(-45, 20);
        ctx.lineTo(-40, 25);
        ctx.lineTo(-20, 10);
        ctx.closePath();
        ctx.fill();
        
        if (!building.isBlueprint) {
            ctx.save();
            ctx.rotate(building.angle);
            
            // Gun barrel housing/breech
            ctx.fillStyle = '#4a4a4a';
            ctx.fillRect(-15, -10, 35, 20);
            
            // Barrel - field gun style
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(15, -6, 45, 12);
            
            // Barrel taper
            ctx.fillStyle = '#3a3a3a';
            ctx.beginPath();
            ctx.moveTo(55, -6);
            ctx.lineTo(70, -4);
            ctx.lineTo(70, 4);
            ctx.lineTo(55, 6);
            ctx.closePath();
            ctx.fill();
            
            // Muzzle
            ctx.fillStyle = '#2a2a2a';
            ctx.beginPath();
            ctx.arc(72, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(72, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Recoil mechanism housing
            ctx.fillStyle = '#5a5a5a';
            ctx.fillRect(5, -12, 15, 6);
            ctx.fillRect(5, 6, 15, 6);
            
            // Elevation wheel
            ctx.fillStyle = '#4a4a4a';
            ctx.beginPath();
            ctx.arc(-10, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#3a3a3a';
            ctx.beginPath();
            ctx.arc(-10, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // Shield (gun shield for crew protection)
        if (!building.isBlueprint) {
            ctx.fillStyle = '#4a4a4a';
            ctx.beginPath();
            ctx.moveTo(-18, -20);
            ctx.lineTo(18, -20);
            ctx.lineTo(20, -5);
            ctx.lineTo(-20, -5);
            ctx.closePath();
            ctx.fill();
            
            // Shield rivet details
            ctx.fillStyle = '#5a5a5a';
            for (let x = -12; x <= 12; x += 8) {
                ctx.beginPath();
                ctx.arc(x, -12, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Build progress bar
        if (building.isBlueprint) {
            ctx.globalAlpha = 1;
            const barWidth = 50;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(-barWidth/2 - 1, 38, barWidth + 2, 6);
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, 39, barWidth, 4);
            ctx.fillStyle = '#44aa44';
            ctx.fillRect(-barWidth/2, 39, barWidth * building.buildProgress, 4);
        } else if (!building.assignedUnit && building.needsManning) {
            const pulse = 0.7 + Math.sin(Date.now() / 200) * 0.3;
            ctx.fillStyle = `rgba(170, 68, 68, ${pulse})`;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('NO CREW', 0, 45);
        } else if (!building.isBlueprint) {
            // Show ammo count for built artillery
            this.renderAmmoBar(ctx, building, 50);
        }
        
        this.renderHealthBar(ctx, building, 50);
        
        ctx.restore();
    }
    
    drawArtilleryWheel(ctx, x, y, radius) {
        // Outer rim
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner wooden part
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.beginPath();
        ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Spokes
        ctx.strokeStyle = CONFIG.COLORS.TREE_TRUNK_LIGHT;
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * (radius - 3), y + Math.sin(angle) * (radius - 3));
            ctx.stroke();
        }
        
        // Hub
        ctx.fillStyle = '#4a4a4a';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    renderDestroyed(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        // Burn mark on ground
        ctx.fillStyle = '#1a1a0a';
        ctx.beginPath();
        ctx.ellipse(0, 5, building.radius * 1.2, building.radius * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Debris - more detailed
        const debrisCount = building.type === 'hq' ? 15 : 10;
        for (let i = 0; i < debrisCount; i++) {
            const angle = (i / debrisCount) * Math.PI * 2 + building.x * 0.1;
            const dist = Math.random() * building.radius * 1.2;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist * 0.7;
            const size = 3 + Math.random() * 12;
            
            // Debris pieces
            if (i % 3 === 0) {
                ctx.fillStyle = CONFIG.COLORS.DEBRIS;
            } else if (i % 3 === 1) {
                ctx.fillStyle = '#2a2a1a';
            } else {
                ctx.fillStyle = CONFIG.COLORS.METAL;
            }
            ctx.fillRect(x - size/2, y - size/2, size, size * 0.7);
        }
        
        // Smoke wisps (subtle)
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#3a3530';
        for (let i = 0; i < 3; i++) {
            const time = Date.now() / 1000;
            const x = Math.sin(time + i * 2) * 10;
            const y = -20 - i * 15 - (time % 3) * 10;
            const size = 15 + i * 5;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        
        ctx.restore();
    }
    
    renderHealthBar(ctx, building, width) {
        if (building.isBlueprint) return;
        
        const barHeight = 4;
        const healthPercent = building.health / building.maxHealth;
        
        if (healthPercent >= 1) return;
        
        const barY = building.type === 'hq' ? -building.radius - 50 : -building.radius - 20;
        
        // Background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-width/2 - 1, barY - 1, width + 2, barHeight + 2);
        
        // Bar background
        ctx.fillStyle = '#333';
        ctx.fillRect(-width/2, barY, width, barHeight);
        
        // Health bar with color gradient
        const healthColor = healthPercent > 0.6 ? '#44dd44' : 
                           healthPercent > 0.3 ? '#dddd44' : '#dd4444';
        ctx.fillStyle = healthColor;
        ctx.fillRect(-width/2, barY, width * healthPercent, barHeight);
        
        // Highlight on top of health bar
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(-width/2, barY, width * healthPercent, 1);
    }
    
    renderAmmoBar(ctx, building, width) {
        if (!building.maxAmmo) return;
        
        const barHeight = 3;
        const ammoPercent = building.ammoCount / building.maxAmmo;
        const barY = 38; // Below the artillery
        
        // Background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-width/2 - 1, barY - 1, width + 2, barHeight + 2);
        
        // Bar background
        ctx.fillStyle = '#333';
        ctx.fillRect(-width/2, barY, width, barHeight);
        
        // Ammo bar - orange/yellow color
        const ammoColor = ammoPercent > 0.5 ? '#ddaa44' : 
                         ammoPercent > 0.2 ? '#dd6644' : '#dd4444';
        ctx.fillStyle = ammoColor;
        ctx.fillRect(-width/2, barY, width * ammoPercent, barHeight);
        
        // Shell icons
        ctx.fillStyle = '#888';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${building.ammoCount}/${building.maxAmmo}`, 0, barY + barHeight + 10);
        
        // Warning if low ammo
        if (ammoPercent <= 0.2 && building.assignedUnit) {
            const pulse = 0.6 + Math.sin(Date.now() / 150) * 0.4;
            ctx.fillStyle = `rgba(221, 68, 68, ${pulse})`;
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText('LOW AMMO', 0, barY + barHeight + 22);
        }
    }
    
    // Medical Tent - WWI field hospital tent
    renderMedicalTent(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        if (building.isBlueprint) {
            ctx.globalAlpha = 0.5;
        }
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(4, 25, 40, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Tent base/floor
        ctx.fillStyle = CONFIG.COLORS.DUCKBOARD;
        ctx.fillRect(-35, 5, 70, 20);
        
        // Main tent canvas - peaked shape
        ctx.fillStyle = '#8a8570'; // Canvas color
        ctx.beginPath();
        ctx.moveTo(-40, 15);
        ctx.lineTo(-35, -30);
        ctx.lineTo(0, -45);
        ctx.lineTo(35, -30);
        ctx.lineTo(40, 15);
        ctx.closePath();
        ctx.fill();
        
        // Tent side shading
        ctx.fillStyle = '#6a6550';
        ctx.beginPath();
        ctx.moveTo(-40, 15);
        ctx.lineTo(-35, -30);
        ctx.lineTo(0, -45);
        ctx.lineTo(0, 15);
        ctx.closePath();
        ctx.fill();
        
        // Tent entrance
        ctx.fillStyle = '#2a2a20';
        ctx.beginPath();
        ctx.moveTo(-15, 15);
        ctx.lineTo(-10, -20);
        ctx.lineTo(10, -20);
        ctx.lineTo(15, 15);
        ctx.closePath();
        ctx.fill();
        
        // Red cross symbol
        ctx.fillStyle = '#aa2020';
        ctx.fillRect(-8, -35, 16, 4);
        ctx.fillRect(-2, -41, 4, 16);
        
        // White background for cross
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, -33, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#cc3030';
        ctx.fillRect(-7, -36, 14, 4);
        ctx.fillRect(-2, -41, 4, 14);
        
        // Tent poles
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.fillRect(-2, -45, 4, 60);
        
        // Guy ropes
        ctx.strokeStyle = '#5a5040';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-35, -30);
        ctx.lineTo(-50, 20);
        ctx.moveTo(35, -30);
        ctx.lineTo(50, 20);
        ctx.stroke();
        
        // Healing range indicator (subtle)
        if (!building.isBlueprint) {
            ctx.globalAlpha = 0.1;
            ctx.strokeStyle = '#44ff44';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(0, 0, building.healRange, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
        
        // Build progress
        if (building.isBlueprint) {
            ctx.globalAlpha = 1;
            const barWidth = 45;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(-barWidth/2 - 1, 32, barWidth + 2, 6);
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, 33, barWidth, 4);
            ctx.fillStyle = '#44aa44';
            ctx.fillRect(-barWidth/2, 33, barWidth * building.buildProgress, 4);
        }
        
        this.renderHealthBar(ctx, building, 50);
        
        ctx.restore();
    }
    
    // Bunker - WWI concrete pillbox
    renderBunker(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        if (building.isBlueprint) {
            ctx.globalAlpha = 0.5;
        }
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(5, 28, 45, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Main bunker structure - concrete
        ctx.fillStyle = '#5a5a52';
        ctx.beginPath();
        ctx.moveTo(-40, 20);
        ctx.lineTo(-35, -25);
        ctx.lineTo(35, -25);
        ctx.lineTo(40, 20);
        ctx.closePath();
        ctx.fill();
        
        // Darker concrete texture
        ctx.fillStyle = '#4a4a42';
        ctx.fillRect(-35, -20, 70, 35);
        
        // Top/roof
        ctx.fillStyle = '#6a6a62';
        ctx.fillRect(-38, -28, 76, 8);
        
        // Firing slits with soldiers visible inside
        for (let i = 0; i < 4; i++) {
            const slitX = -25 + i * 17;
            
            // Dark slit background
            ctx.fillStyle = '#1a1a15';
            ctx.fillRect(slitX, -10, 12, 4);
            
            // Show soldier helmet if occupied
            if (!building.isBlueprint && building.occupants && i < building.occupants.length) {
                // Helmet visible in slit
                ctx.fillStyle = '#4a5a3a'; // Helmet color
                ctx.beginPath();
                ctx.arc(slitX + 6, -8, 4, Math.PI, 0); // Half circle helmet
                ctx.fill();
                
                // Helmet rim
                ctx.fillStyle = '#3a4a2a';
                ctx.fillRect(slitX + 2, -8, 8, 2);
            }
        }
        
        // Entrance (back)
        ctx.fillStyle = '#2a2a25';
        ctx.fillRect(-12, 10, 24, 15);
        
        // Sandbags around base
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const bx = Math.cos(angle) * 38;
            const by = Math.sin(angle) * 20 + 15;
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
            ctx.beginPath();
            ctx.ellipse(bx + 1, by + 1, 8, 5, angle, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG;
            ctx.beginPath();
            ctx.ellipse(bx, by, 7, 4, angle, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Occupant count display
        if (!building.isBlueprint) {
            ctx.fillStyle = '#888';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${building.occupants.length}/${building.capacity}`, 0, 38);
        }
        
        // Build progress
        if (building.isBlueprint) {
            ctx.globalAlpha = 1;
            const barWidth = 50;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(-barWidth/2 - 1, 35, barWidth + 2, 6);
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, 36, barWidth, 4);
            ctx.fillStyle = '#44aa44';
            ctx.fillRect(-barWidth/2, 36, barWidth * building.buildProgress, 4);
        }
        
        this.renderHealthBar(ctx, building, 55);
        
        ctx.restore();
    }
    
    // Observation Post - fortified sandbagged emplacement with viewing slit
    renderObservationPost(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        if (building.isBlueprint) {
            ctx.globalAlpha = 0.5;
        }
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(3, 18, 28, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Dugout pit (dark interior visible)
        ctx.fillStyle = CONFIG.COLORS.TRENCH;
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Outer sandbag wall ring
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const bx = Math.cos(angle) * 20;
            const by = Math.sin(angle) * 16;
            
            // Skip the front viewing area
            if (angle > 1.2 && angle < 1.9) continue;
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
            ctx.beginPath();
            ctx.ellipse(bx + 1, by + 1, 8, 5, angle, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG;
            ctx.beginPath();
            ctx.ellipse(bx, by, 7, 4.5, angle, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Second layer of sandbags (stacked)
        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2 + 0.15;
            const bx = Math.cos(angle) * 17;
            const by = Math.sin(angle) * 13 - 6;
            
            // Skip the viewing slit area
            if (angle > 1.0 && angle < 2.1) continue;
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
            ctx.beginPath();
            ctx.ellipse(bx + 1, by + 1, 7, 4, angle, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG;
            ctx.beginPath();
            ctx.ellipse(bx, by, 6, 3.5, angle, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Reinforced front viewing slit (facing right/enemy)
        ctx.fillStyle = CONFIG.COLORS.TRENCH;
        ctx.fillRect(15, -4, 10, 8);
        
        // Metal plate around slit for protection
        ctx.fillStyle = CONFIG.COLORS.METAL;
        ctx.fillRect(22, -6, 4, 12);
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(23, -5, 2, 10);
        
        // Wooden support beams
        ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.fillRect(-12, -10, 4, 3);
        ctx.fillRect(8, -10, 4, 3);
        
        // Corrugated iron roof section (partial cover)
        ctx.fillStyle = '#4a4a4a';
        ctx.beginPath();
        ctx.moveTo(-15, -12);
        ctx.lineTo(12, -12);
        ctx.lineTo(14, -8);
        ctx.lineTo(-13, -8);
        ctx.closePath();
        ctx.fill();
        
        // Roof ribs
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 1;
        for (let x = -12; x <= 10; x += 4) {
            ctx.beginPath();
            ctx.moveTo(x, -12);
            ctx.lineTo(x + 1, -8);
            ctx.stroke();
        }
        
        // Periscope/binoculars on stand (if manned)
        if (!building.isBlueprint && building.assignedUnit) {
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(18, -8, 3, 6);
            // Binocular lenses
            ctx.fillStyle = '#1a3a4a';
            ctx.beginPath();
            ctx.arc(19, -9, 2, 0, Math.PI * 2);
            ctx.arc(21, -9, 2, 0, Math.PI * 2);
            ctx.fill();
            // Lens glint
            ctx.fillStyle = '#4a6a7a';
            ctx.fillRect(18, -10, 1, 1);
        }
        
        // Duckboard floor
        ctx.fillStyle = CONFIG.COLORS.DUCKBOARD;
        ctx.fillRect(-10, -2, 20, 10);
        ctx.strokeStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.lineWidth = 1;
        for (let i = -8; i <= 8; i += 4) {
            ctx.beginPath();
            ctx.moveTo(i, -2);
            ctx.lineTo(i, 8);
            ctx.stroke();
        }
        
        // Camouflage netting draped over edges
        ctx.strokeStyle = '#4a5a3a';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(-20, -6);
        ctx.quadraticCurveTo(-25, 2, -18, 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-15, -10);
        ctx.quadraticCurveTo(-20, -2, -15, 8);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Vision range indicator (subtle)
        if (!building.isBlueprint && building.assignedUnit) {
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = '#4488ff';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.arc(0, 0, building.visionRange, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
        
        // Build progress or crew needed
        if (building.isBlueprint) {
            ctx.globalAlpha = 1;
            const barWidth = 35;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(-barWidth/2 - 1, 25, barWidth + 2, 6);
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, 26, barWidth, 4);
            ctx.fillStyle = '#44aa44';
            ctx.fillRect(-barWidth/2, 26, barWidth * building.buildProgress, 4);
        } else if (!building.assignedUnit && building.needsManning) {
            const pulse = 0.7 + Math.sin(Date.now() / 200) * 0.3;
            ctx.fillStyle = `rgba(170, 68, 68, ${pulse})`;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('NO CREW', 0, 32);
        }
        
        this.renderHealthBar(ctx, building, 30);
        
        ctx.restore();
    }
    
    // Supply Depot - WWI storage shed
    renderSupplyDepot(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        if (building.isBlueprint) {
            ctx.globalAlpha = 0.5;
        }
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(5, 30, 45, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Base/floor
        ctx.fillStyle = CONFIG.COLORS.DUCKBOARD;
        ctx.fillRect(-40, 10, 80, 20);
        
        // Main shed structure
        ctx.fillStyle = '#4a4030';
        ctx.fillRect(-38, -25, 76, 40);
        
        // Darker walls
        ctx.fillStyle = '#3a3020';
        ctx.fillRect(-38, -25, 20, 40);
        
        // Horizontal planks
        ctx.strokeStyle = '#5a5040';
        ctx.lineWidth = 1;
        for (let y = -20; y < 15; y += 6) {
            ctx.beginPath();
            ctx.moveTo(-36, y);
            ctx.lineTo(36, y);
            ctx.stroke();
        }
        
        // Roof
        ctx.fillStyle = '#3a3025';
        ctx.beginPath();
        ctx.moveTo(-42, -25);
        ctx.lineTo(0, -45);
        ctx.lineTo(42, -25);
        ctx.closePath();
        ctx.fill();
        
        // Roof highlight
        ctx.fillStyle = '#4a4035';
        ctx.beginPath();
        ctx.moveTo(-38, -27);
        ctx.lineTo(0, -42);
        ctx.lineTo(0, -25);
        ctx.lineTo(-38, -25);
        ctx.closePath();
        ctx.fill();
        
        // Door
        ctx.fillStyle = '#2a2015';
        ctx.fillRect(-12, -5, 24, 20);
        ctx.fillStyle = '#3a3025';
        ctx.fillRect(-10, -3, 20, 16);
        
        // Crates outside
        this.drawCrate(ctx, -30, 5, 12);
        this.drawCrate(ctx, 25, 8, 10);
        this.drawCrate(ctx, 30, 0, 8);
        
        // Shell boxes
        ctx.fillStyle = '#4a4a3a';
        ctx.fillRect(-35, 15, 15, 10);
        ctx.fillRect(20, 15, 15, 10);
        ctx.fillStyle = '#3a3a2a';
        ctx.fillRect(-34, 16, 13, 3);
        ctx.fillRect(21, 16, 13, 3);
        
        // Storage indicator
        if (!building.isBlueprint) {
            ctx.fillStyle = '#888';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`+${Math.floor(building.regenBonus * 100)}% Supply`, 0, 42);
        }
        
        // Build progress
        if (building.isBlueprint) {
            ctx.globalAlpha = 1;
            const barWidth = 50;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(-barWidth/2 - 1, 38, barWidth + 2, 6);
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, 39, barWidth, 4);
            ctx.fillStyle = '#44aa44';
            ctx.fillRect(-barWidth/2, 39, barWidth * building.buildProgress, 4);
        }
        
        this.renderHealthBar(ctx, building, 50);
        
        ctx.restore();
    }
    
    drawCrate(ctx, x, y, size) {
        ctx.fillStyle = '#5a4a30';
        ctx.fillRect(x, y, size, size * 0.8);
        ctx.strokeStyle = '#4a3a20';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, size, size * 0.8);
        // Cross straps
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y + size * 0.8);
        ctx.moveTo(x + size, y);
        ctx.lineTo(x, y + size * 0.8);
        ctx.stroke();
    }
    
    // Mortar - sandbag pit with mortar tube
    renderMortar(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        if (building.isBlueprint) {
            ctx.globalAlpha = 0.5;
        }
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.ellipse(3, 18, 30, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Sandbag ring
        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2;
            const bx = Math.cos(angle) * 22;
            const by = Math.sin(angle) * 18;
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
            ctx.beginPath();
            ctx.ellipse(bx + 1, by + 2, 9, 5, angle, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG;
            ctx.beginPath();
            ctx.ellipse(bx, by, 8, 4.5, angle, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Inner pit
        ctx.fillStyle = CONFIG.COLORS.TRENCH;
        ctx.beginPath();
        ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Duckboard floor
        ctx.fillStyle = CONFIG.COLORS.DUCKBOARD;
        ctx.fillRect(-10, -6, 20, 12);
        
        // Mortar tube (if not blueprint)
        if (!building.isBlueprint) {
            ctx.save();
            ctx.rotate(building.angle || 0);
            
            // Base plate
            ctx.fillStyle = '#4a4a4a';
            ctx.fillRect(-8, -8, 16, 16);
            
            // Bipod legs
            ctx.strokeStyle = '#3a3a3a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-15, 10);
            ctx.moveTo(0, 0);
            ctx.lineTo(15, 10);
            ctx.stroke();
            
            // Mortar tube
            ctx.fillStyle = '#3a3a3a';
            ctx.beginPath();
            ctx.moveTo(-4, 0);
            ctx.lineTo(-3, -30);
            ctx.lineTo(3, -30);
            ctx.lineTo(4, 0);
            ctx.closePath();
            ctx.fill();
            
            // Tube opening
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.ellipse(0, -30, 3, 2, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // Ammo boxes nearby
        ctx.fillStyle = '#4a4030';
        ctx.fillRect(-25, 8, 12, 8);
        ctx.fillRect(15, 10, 10, 7);
        
        // Build progress or crew status
        if (building.isBlueprint) {
            ctx.globalAlpha = 1;
            const barWidth = 35;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(-barWidth/2 - 1, 28, barWidth + 2, 6);
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, 29, barWidth, 4);
            ctx.fillStyle = '#44aa44';
            ctx.fillRect(-barWidth/2, 29, barWidth * building.buildProgress, 4);
        } else if (!building.assignedUnit && building.needsManning) {
            const pulse = 0.7 + Math.sin(Date.now() / 200) * 0.3;
            ctx.fillStyle = `rgba(170, 68, 68, ${pulse})`;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('NO CREW', 0, 35);
        } else if (!building.isBlueprint) {
            // Show ammo
            this.renderAmmoBar(ctx, building, 35);
        }
        
        this.renderHealthBar(ctx, building, 30);
        
        ctx.restore();
    }
}
