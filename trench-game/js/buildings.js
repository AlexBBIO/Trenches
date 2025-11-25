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
        this.buildingConnections = new Map(); // buildingId -> { trenchPoint, trench }
        this.connectionRange = 100; // Max range for building-trench connections
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
                building.ammoCount = 0;     // Artillery starts empty, needs shells
                building.maxAmmo = 10;      // Max shells artillery can hold
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
    
    getUnmannedEmplacement(team) {
        return this.buildings.find(b => 
            b.team === team && 
            !b.destroyed && 
            !b.isBlueprint &&
            b.needsManning && 
            !b.assignedUnit
        );
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
    findArtilleryNeedingResupply(team, excludeIds = []) {
        const artillery = this.getArtilleryNeedingAmmo(team);
        for (const art of artillery) {
            if (!excludeIds.includes(art.id) && art.ammoCount < art.maxAmmo * 0.7) {
                return art;
            }
        }
        return null;
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
        
        if (type === 'artillery') {
            if (x > CONFIG.MAP_WIDTH * 0.4) {
                return false;
            }
        }
        
        return true;
    }
    
    // Find damaged structures for repair
    findDamagedStructure(x, y, team) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const building of this.buildings) {
            if (building.team !== team || building.destroyed || building.isBlueprint) continue;
            if (building.health >= building.maxHealth) continue;
            
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
                if (building.assignedUnit && !building.assignedUnit.state === 'dead') {
                    // Unit died, clear assignment
                    building.assignedUnit = null;
                }
                
                if (building.assignedUnit) {
                    this.updateWeapon(building, dt);
                }
            }
        }
        
        // Update barbed wire effects
        for (const wire of this.barbedWireLines) {
            if (wire.destroyed || wire.isBlueprint) continue;
            this.updateBarbedWireEffect(wire);
        }
        
        // Update building-trench connections periodically
        this.updateBuildingConnections();
    }
    
    updateBuildingConnections() {
        for (const building of this.buildings) {
            if (building.destroyed || building.isBlueprint) continue;
            if (building.type === 'hq') continue; // HQ doesn't need trench connection
            
            // Find nearest trench point
            const nearestTrench = this.game.trenchSystem.findNearestTrenchPoint(
                building.x, building.y, building.team
            );
            
            if (nearestTrench && nearestTrench.distance < this.connectionRange) {
                this.buildingConnections.set(building.id, {
                    buildingX: building.x,
                    buildingY: building.y,
                    trenchX: nearestTrench.x,
                    trenchY: nearestTrench.y,
                    distance: nearestTrench.distance,
                    trench: nearestTrench.trench
                });
            } else {
                this.buildingConnections.delete(building.id);
            }
        }
    }
    
    updateWeapon(building, dt) {
        const enemies = this.game.unitManager.getEnemiesInRange(
            building.x, building.y, building.range, building.team
        );
        
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
            const targetX = target.x + (Math.random() - 0.5) * 40;
            const targetY = target.y + (Math.random() - 0.5) * 40;
            
            this.game.addEffect('muzzle',
                building.x + Math.cos(building.angle) * 35,
                building.y + Math.sin(building.angle) * 35,
                { size: 30, duration: 0.2 }
            );
            
            setTimeout(() => {
                this.artilleryExplosion(targetX, targetY, building);
            }, 1000);
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
            if (building.assignedUnit) {
                building.assignedUnit.mannedBuilding = null;
                building.assignedUnit = null;
            }
            this.game.addEffect('explosion', building.x, building.y, {
                size: building.type === 'hq' ? 80 : 40,
                duration: 0.8
            });
        }
    }
    
    render(ctx) {
        // Render building-trench connections FIRST (underneath everything)
        this.renderBuildingConnections(ctx);
        
        // Render barbed wire lines
        for (const wire of this.barbedWireLines) {
            if (wire.destroyed) continue;
            this.renderBarbedWireLine(ctx, wire);
        }
        
        // Render buildings - sort by y for proper overlap
        const sortedBuildings = [...this.buildings].sort((a, b) => a.y - b.y);
        for (const building of sortedBuildings) {
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
            }
        }
    }
    
    renderBuildingConnections(ctx) {
        for (const [buildingId, connection] of this.buildingConnections) {
            this.renderConnectionPathway(ctx, connection);
        }
    }
    
    renderConnectionPathway(ctx, connection) {
        const { buildingX, buildingY, trenchX, trenchY, distance } = connection;
        
        // Calculate direction and perpendicular
        const dx = trenchX - buildingX;
        const dy = trenchY - buildingY;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 10) return;
        
        const nx = -dy / length; // Perpendicular normal
        const ny = dx / length;
        const pathWidth = 14;
        
        ctx.save();
        
        // Shadow underneath
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.moveTo(buildingX + nx * (pathWidth/2 + 2) + 2, buildingY + ny * (pathWidth/2 + 2) + 2);
        ctx.lineTo(trenchX + nx * (pathWidth/2 + 2) + 2, trenchY + ny * (pathWidth/2 + 2) + 2);
        ctx.lineTo(trenchX - nx * (pathWidth/2 + 2) + 2, trenchY - ny * (pathWidth/2 + 2) + 2);
        ctx.lineTo(buildingX - nx * (pathWidth/2 + 2) + 2, buildingY - ny * (pathWidth/2 + 2) + 2);
        ctx.closePath();
        ctx.fill();
        
        // Dirt path edges (dug out earth)
        ctx.fillStyle = CONFIG.COLORS.MUD_LIGHT;
        ctx.beginPath();
        ctx.moveTo(buildingX + nx * pathWidth/2, buildingY + ny * pathWidth/2);
        ctx.lineTo(trenchX + nx * pathWidth/2, trenchY + ny * pathWidth/2);
        ctx.lineTo(trenchX - nx * pathWidth/2, trenchY - ny * pathWidth/2);
        ctx.lineTo(buildingX - nx * pathWidth/2, buildingY - ny * pathWidth/2);
        ctx.closePath();
        ctx.fill();
        
        // Inner path (darker, like a shallow trench)
        ctx.fillStyle = CONFIG.COLORS.TRENCH_WALL;
        ctx.beginPath();
        ctx.moveTo(buildingX + nx * (pathWidth/2 - 3), buildingY + ny * (pathWidth/2 - 3));
        ctx.lineTo(trenchX + nx * (pathWidth/2 - 3), trenchY + ny * (pathWidth/2 - 3));
        ctx.lineTo(trenchX - nx * (pathWidth/2 - 3), trenchY - ny * (pathWidth/2 - 3));
        ctx.lineTo(buildingX - nx * (pathWidth/2 - 3), buildingY - ny * (pathWidth/2 - 3));
        ctx.closePath();
        ctx.fill();
        
        // Duckboards along the path
        const boardSpacing = 12;
        const boardCount = Math.floor(length / boardSpacing);
        
        for (let i = 1; i < boardCount; i++) {
            const t = i / boardCount;
            const px = buildingX + dx * t;
            const py = buildingY + dy * t;
            
            // Board shadow
            ctx.fillStyle = '#1a1505';
            ctx.save();
            ctx.translate(px + 1, py + 1);
            ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
            ctx.fillRect(-5, -1.5, 10, 3);
            ctx.restore();
            
            // Main board
            ctx.fillStyle = CONFIG.COLORS.DUCKBOARD;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
            ctx.fillRect(-5, -1.5, 10, 3);
            ctx.restore();
        }
        
        // Small sandbag corners at connection points
        this.drawSmallSandbags(ctx, buildingX, buildingY, nx, ny, pathWidth);
        this.drawSmallSandbags(ctx, trenchX, trenchY, nx, ny, pathWidth);
        
        ctx.restore();
    }
    
    drawSmallSandbags(ctx, x, y, nx, ny, width) {
        for (let side = -1; side <= 1; side += 2) {
            const bx = x + nx * (width/2 + 2) * side;
            const by = y + ny * (width/2 + 2) * side;
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
            ctx.beginPath();
            ctx.ellipse(bx + 1, by + 1, 4, 3, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG;
            ctx.beginPath();
            ctx.ellipse(bx, by, 4, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }
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
}
