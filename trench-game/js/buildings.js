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
            this.fire(building, target);
            building.attackCooldown = 1 / building.fireRate;
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
        // Render barbed wire lines
        for (const wire of this.barbedWireLines) {
            if (wire.destroyed) continue;
            this.renderBarbedWireLine(ctx, wire);
        }
        
        // Render buildings
        for (const building of this.buildings) {
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
    
    renderBarbedWireLine(ctx, wire) {
        for (const seg of wire.segments) {
            const start = seg.start;
            const end = seg.built ? seg.end : {
                x: start.x + (seg.end.x - start.x) * seg.progress,
                y: start.y + (seg.end.y - start.y) * seg.progress
            };
            
            if (seg.progress === 0 && !seg.built) {
                // Unbuilt - show blueprint
                ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)';
                ctx.lineWidth = 8;
                ctx.setLineDash([5, 5]);
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
        
        // Posts
        ctx.fillStyle = '#3a2a1a';
        const postCount = Math.max(2, Math.floor(length / 40));
        for (let i = 0; i <= postCount; i++) {
            const t = i / postCount;
            const px = start.x + dx * t;
            const py = start.y + dy * t;
            ctx.fillRect(px - 2, py - 8, 4, 16);
        }
        
        // Wires
        ctx.strokeStyle = '#4a4a4a';
        ctx.lineWidth = 1;
        
        for (let row = -2; row <= 2; row++) {
            ctx.beginPath();
            ctx.moveTo(start.x + nx * row * 3, start.y + ny * row * 3);
            ctx.lineTo(end.x + nx * row * 3, end.y + ny * row * 3);
            ctx.stroke();
        }
        
        // Barbs
        ctx.strokeStyle = '#5a5a5a';
        const barbCount = Math.floor(length / 8);
        for (let i = 0; i < barbCount; i++) {
            const t = (i + 0.5) / barbCount;
            const bx = start.x + dx * t;
            const by = start.y + dy * t;
            
            ctx.beginPath();
            ctx.moveTo(bx - 2, by - 4);
            ctx.lineTo(bx + 2, by + 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(bx + 2, by - 4);
            ctx.lineTo(bx - 2, by + 4);
            ctx.stroke();
        }
    }
    
    renderHQ(ctx, building) {
        const isEnemy = building.team === CONFIG.TEAM_ENEMY;
        
        ctx.save();
        ctx.translate(building.x, building.y);
        
        ctx.fillStyle = isEnemy ? '#5c3d2e' : '#3d5c3d';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.rect(-40, -30, 80, 60);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = isEnemy ? '#4a2d1e' : '#2d4a2d';
        ctx.beginPath();
        ctx.moveTo(-45, -30);
        ctx.lineTo(0, -50);
        ctx.lineTo(45, -30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#2a1a0a';
        ctx.fillRect(-10, 0, 20, 30);
        
        ctx.fillStyle = isEnemy ? '#8b0000' : '#006400';
        ctx.beginPath();
        ctx.moveTo(0, -50);
        ctx.lineTo(0, -80);
        ctx.lineTo(25, -70);
        ctx.lineTo(0, -60);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -50);
        ctx.lineTo(0, -80);
        ctx.stroke();
        
        this.renderHealthBar(ctx, building, 60);
        
        ctx.restore();
    }
    
    renderMachineGun(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        // Blueprint mode
        if (building.isBlueprint) {
            ctx.globalAlpha = 0.5;
        }
        
        // Sandbag emplacement
        ctx.fillStyle = CONFIG.COLORS.SANDBAG;
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = CONFIG.COLORS.TRENCH;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Gun (only show if not blueprint)
        if (!building.isBlueprint) {
            ctx.save();
            ctx.rotate(building.angle);
            
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-8, -8);
            ctx.lineTo(5, 0);
            ctx.moveTo(-8, 8);
            ctx.lineTo(5, 0);
            ctx.stroke();
            
            ctx.fillStyle = '#444';
            ctx.fillRect(0, -5, 25, 10);
            
            ctx.fillStyle = '#333';
            ctx.fillRect(20, -2, 15, 4);
            
            ctx.restore();
        }
        
        // Build progress bar
        if (building.isBlueprint) {
            ctx.globalAlpha = 1;
            const barWidth = 30;
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, 30, barWidth, 4);
            ctx.fillStyle = '#4a4';
            ctx.fillRect(-barWidth/2, 30, barWidth * building.buildProgress, 4);
        } else if (!building.assignedUnit && building.needsManning) {
            // Show "needs crew" indicator
            ctx.fillStyle = '#aa4444';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('NO CREW', 0, 35);
        }
        
        this.renderHealthBar(ctx, building, 30);
        
        ctx.restore();
    }
    
    renderArtillery(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        
        if (building.isBlueprint) {
            ctx.globalAlpha = 0.5;
        }
        
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(-25, -15, 50, 30);
        
        ctx.fillStyle = '#333';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(-20, 15, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(20, 15, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        if (!building.isBlueprint) {
            ctx.save();
            ctx.rotate(building.angle);
            
            ctx.fillStyle = '#555';
            ctx.fillRect(-10, -8, 50, 16);
            
            ctx.fillStyle = '#444';
            ctx.fillRect(35, -6, 20, 12);
            
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(55, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        ctx.fillStyle = '#666';
        ctx.fillRect(-15, -12, 20, 24);
        
        // Build progress bar
        if (building.isBlueprint) {
            ctx.globalAlpha = 1;
            const barWidth = 40;
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, 35, barWidth, 4);
            ctx.fillStyle = '#4a4';
            ctx.fillRect(-barWidth/2, 35, barWidth * building.buildProgress, 4);
        } else if (!building.assignedUnit && building.needsManning) {
            ctx.fillStyle = '#aa4444';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('NO CREW', 0, 40);
        }
        
        this.renderHealthBar(ctx, building, 40);
        
        ctx.restore();
    }
    
    renderDestroyed(ctx, building) {
        ctx.save();
        ctx.translate(building.x, building.y);
        ctx.globalAlpha = 0.6;
        
        ctx.fillStyle = '#333';
        for (let i = 0; i < 8; i++) {
            const x = (Math.random() - 0.5) * building.radius * 1.5;
            const y = (Math.random() - 0.5) * building.radius * 1.5;
            const size = 5 + Math.random() * 15;
            ctx.fillRect(x, y, size, size);
        }
        
        ctx.fillStyle = 'rgba(50, 50, 50, 0.3)';
        ctx.beginPath();
        ctx.arc(0, -20, 20, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    renderHealthBar(ctx, building, width) {
        if (building.isBlueprint) return;
        
        const barHeight = 4;
        const healthPercent = building.health / building.maxHealth;
        
        if (healthPercent >= 1) return;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(-width/2, -building.radius - 15, width, barHeight);
        
        ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : healthPercent > 0.25 ? '#ff0' : '#f00';
        ctx.fillRect(-width/2, -building.radius - 15, width * healthPercent, barHeight);
    }
}
