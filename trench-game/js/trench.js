// Trench System - Trench drawing, building, and pathfinding
import { CONFIG } from './game.js';

export class TrenchSystem {
    constructor(game) {
        this.game = game;
        this.trenches = [];
        this.trenchIdCounter = 0;
        this.claimedSegments = new Map(); // Map of "trenchId-segIdx" -> workerId
    }
    
    clear() {
        this.trenches = [];
    }
    
    createTrench(points, team, isBlueprint = true) {
        // Snap endpoints to nearby trenches for connections
        const snappedPoints = this.snapTrenchPoints(points, team);
        
        const trench = {
            id: this.trenchIdCounter++,
            points: snappedPoints.map(p => ({ ...p })),
            team,
            isBlueprint,
            buildProgress: 0,
            segments: [],
            occupants: [],
            width: 24,
            connections: [] // Connected trench IDs
        };
        
        // Calculate segments for building
        this.calculateSegments(trench);
        
        this.trenches.push(trench);
        
        // Register connections
        this.updateConnections(trench);
        
        // If blueprint, assign workers to build it
        if (isBlueprint) {
            this.assignWorkers(trench);
        }
        
        return trench;
    }
    
    snapTrenchPoints(points, team) {
        if (points.length < 2) return points;
        
        const snapDistance = 30; // Distance to snap to existing trenches
        const snapped = points.map(p => ({ ...p }));
        
        // Check first point
        const startSnap = this.findNearestTrenchPoint(snapped[0].x, snapped[0].y, team, snapDistance);
        if (startSnap) {
            snapped[0] = { x: startSnap.x, y: startSnap.y };
        }
        
        // Check last point
        const endSnap = this.findNearestTrenchPoint(
            snapped[snapped.length - 1].x, 
            snapped[snapped.length - 1].y, 
            team, 
            snapDistance
        );
        if (endSnap) {
            snapped[snapped.length - 1] = { x: endSnap.x, y: endSnap.y };
        }
        
        return snapped;
    }
    
    findNearestTrenchPoint(x, y, team, maxDist) {
        let nearest = null;
        let minDist = maxDist;
        
        for (const trench of this.trenches) {
            if (trench.team !== team) continue;
            
            // Check all points in the trench
            for (const point of trench.points) {
                const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { x: point.x, y: point.y, trench };
                }
            }
            
            // Also check segment endpoints and midpoints for better snapping
            for (const seg of trench.segments) {
                // Check start
                let dist = Math.sqrt((seg.start.x - x) ** 2 + (seg.start.y - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { x: seg.start.x, y: seg.start.y, trench };
                }
                
                // Check end
                dist = Math.sqrt((seg.end.x - x) ** 2 + (seg.end.y - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { x: seg.end.x, y: seg.end.y, trench };
                }
            }
        }
        
        return nearest;
    }
    
    updateConnections(newTrench) {
        const connectionDist = 5; // Very close = connected
        
        for (const trench of this.trenches) {
            if (trench === newTrench || trench.team !== newTrench.team) continue;
            
            // Check if endpoints connect
            const newStart = newTrench.points[0];
            const newEnd = newTrench.points[newTrench.points.length - 1];
            
            for (const point of trench.points) {
                const distToStart = Math.sqrt((point.x - newStart.x) ** 2 + (point.y - newStart.y) ** 2);
                const distToEnd = Math.sqrt((point.x - newEnd.x) ** 2 + (point.y - newEnd.y) ** 2);
                
                if (distToStart < connectionDist || distToEnd < connectionDist) {
                    // They're connected!
                    if (!newTrench.connections.includes(trench.id)) {
                        newTrench.connections.push(trench.id);
                    }
                    if (!trench.connections.includes(newTrench.id)) {
                        trench.connections.push(newTrench.id);
                    }
                }
            }
        }
    }
    
    calculateSegments(trench) {
        trench.segments = [];
        
        for (let i = 0; i < trench.points.length - 1; i++) {
            const p1 = trench.points[i];
            const p2 = trench.points[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            trench.segments.push({
                start: p1,
                end: p2,
                length,
                progress: 0, // 0 to 1
                built: false
            });
        }
        
        trench.totalLength = trench.segments.reduce((sum, s) => sum + s.length, 0);
    }
    
    assignWorkers(trench) {
        // Find available workers on same team (only those without tasks)
        const workers = this.game.unitManager.units.filter(
            u => u.type === 'worker' && u.team === trench.team && u.state === 'idle' && !u.task
        );
        
        // Assign workers to different segments to spread them out
        let segIdx = 0;
        const maxWorkers = Math.min(workers.length, trench.segments.length, 3);
        
        for (let i = 0; i < maxWorkers; i++) {
            const worker = workers[i];
            
            // Find next unbuilt, unclaimed segment
            while (segIdx < trench.segments.length) {
                const seg = trench.segments[segIdx];
                const claimKey = `${trench.id}-${segIdx}`;
                if (!seg.built && !this.claimedSegments.has(claimKey)) {
                    break;
                }
                segIdx++;
            }
            
            if (segIdx >= trench.segments.length) break;
            
            const seg = trench.segments[segIdx];
            worker.assignTask({
                type: 'build_trench',
                trench: trench,
                segmentIndex: segIdx
            });
            // Claim this segment
            this.claimSegment(trench.id, segIdx, worker.id);
            // Move to the segment
            worker.targetX = seg.start.x;
            worker.targetY = seg.start.y;
            worker.setState('moving');
            
            segIdx++;
        }
    }
    
    buildSegment(trench, segmentIndex, amount) {
        if (segmentIndex >= trench.segments.length) return true; // All done
        
        const segment = trench.segments[segmentIndex];
        
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
    
    isTrenchComplete(trench) {
        return trench.segments.every(s => s.built);
    }
    
    completeTrench(trench) {
        trench.isBlueprint = false;
        trench.segments.forEach(s => {
            s.built = true;
            s.progress = 1;
        });
    }
    
    findNearestTrench(x, y, team) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const trench of this.trenches) {
            if (trench.team !== team || trench.isBlueprint) continue;
            
            for (const point of trench.points) {
                const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { x: point.x, y: point.y, trench };
                }
            }
        }
        
        return nearest;
    }
    
    findNearestBuildSite(x, y, team, workerId = null) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const trench of this.trenches) {
            if (trench.team !== team || !trench.isBlueprint) continue;
            
            // Find unbuild segment
            for (let i = 0; i < trench.segments.length; i++) {
                const seg = trench.segments[i];
                if (seg.built) continue;
                
                // Check if segment is claimed by another worker
                const claimKey = `${trench.id}-${i}`;
                const claimedBy = this.claimedSegments.get(claimKey);
                if (claimedBy && claimedBy !== workerId) continue;
                
                // Build from start of segment
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
                        trench,
                        segmentIndex: i
                    };
                }
            }
        }
        
        return nearest;
    }
    
    claimSegment(trenchId, segmentIndex, workerId) {
        const claimKey = `${trenchId}-${segmentIndex}`;
        this.claimedSegments.set(claimKey, workerId);
    }
    
    unclaimSegment(trenchId, segmentIndex) {
        const claimKey = `${trenchId}-${segmentIndex}`;
        this.claimedSegments.delete(claimKey);
    }
    
    unclaimAllForWorker(workerId) {
        for (const [key, id] of this.claimedSegments.entries()) {
            if (id === workerId) {
                this.claimedSegments.delete(key);
            }
        }
    }
    
    isInTrench(x, y, team = null) {
        for (const trench of this.trenches) {
            if (team !== null && trench.team !== team) continue;
            if (trench.isBlueprint) continue;
            
            for (const segment of trench.segments) {
                if (!segment.built) continue;
                
                // Check distance to line segment
                const dist = this.pointToSegmentDistance(x, y, segment.start, segment.end);
                if (dist < trench.width / 2) {
                    return trench;
                }
            }
        }
        
        return null;
    }
    
    pointToSegmentDistance(px, py, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq === 0) {
            return Math.sqrt((px - a.x) ** 2 + (py - a.y) ** 2);
        }
        
        let t = ((px - a.x) * dx + (py - a.y) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        
        const nearestX = a.x + t * dx;
        const nearestY = a.y + t * dy;
        
        return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
    }
    
    getTrenchDefenseBonus(unit) {
        const trench = this.isInTrench(unit.x, unit.y, unit.team);
        if (trench) {
            return 0.5; // 50% damage reduction
        }
        return 0;
    }
    
    getPositionAlongTrench(trench, index, totalUnits) {
        // Calculate total trench length
        let totalLength = 0;
        for (const seg of trench.segments) {
            if (seg.built) {
                totalLength += seg.length;
            }
        }
        
        if (totalLength === 0) return null;
        
        // Spread units along the trench
        const spacing = totalLength / (totalUnits + 1);
        const targetDist = spacing * (index + 1);
        
        // Find the position along the trench
        let accumulated = 0;
        for (const seg of trench.segments) {
            if (!seg.built) continue;
            
            if (accumulated + seg.length >= targetDist) {
                // Position is in this segment
                const t = (targetDist - accumulated) / seg.length;
                return {
                    x: seg.start.x + (seg.end.x - seg.start.x) * t,
                    y: seg.start.y + (seg.end.y - seg.start.y) * t
                };
            }
            accumulated += seg.length;
        }
        
        // Default to last point
        const lastSeg = trench.segments[trench.segments.length - 1];
        return { x: lastSeg.end.x, y: lastSeg.end.y };
    }
    
    // Find an unoccupied position in any friendly trench
    findUnoccupiedTrenchPosition(x, y, team, unit) {
        const minSpacing = 20; // Minimum distance between soldiers
        
        // Get all soldiers currently in trenches
        const soldiersInTrenches = this.game.unitManager.units.filter(u => 
            u !== unit &&
            u.team === team && 
            u.type === 'soldier' && 
            u.state !== 'dead' &&
            (u.assignedTrench || this.isInTrench(u.x, u.y, team))
        );
        
        // Find all friendly trenches
        const friendlyTrenches = this.trenches.filter(t => t.team === team && !t.isBlueprint);
        if (friendlyTrenches.length === 0) return null;
        
        // Sort trenches by distance
        friendlyTrenches.sort((a, b) => {
            const distA = this.getDistanceToTrench(x, y, a);
            const distB = this.getDistanceToTrench(x, y, b);
            return distA - distB;
        });
        
        // For each trench, find unoccupied positions
        for (const trench of friendlyTrenches) {
            const positions = this.getTrenchPositions(trench, minSpacing);
            
            // Find positions that aren't occupied
            for (const pos of positions) {
                let occupied = false;
                
                for (const soldier of soldiersInTrenches) {
                    const dist = Math.sqrt((soldier.x - pos.x) ** 2 + (soldier.y - pos.y) ** 2);
                    if (dist < minSpacing) {
                        occupied = true;
                        break;
                    }
                    // Also check their target position
                    if (soldier.targetX !== undefined) {
                        const targetDist = Math.sqrt((soldier.targetX - pos.x) ** 2 + (soldier.targetY - pos.y) ** 2);
                        if (targetDist < minSpacing) {
                            occupied = true;
                            break;
                        }
                    }
                }
                
                if (!occupied) {
                    return { x: pos.x, y: pos.y, trench };
                }
            }
        }
        
        // All positions occupied - find least crowded spot
        return this.findLeastCrowdedPosition(friendlyTrenches, soldiersInTrenches);
    }
    
    getTrenchPositions(trench, spacing) {
        const positions = [];
        let accumulated = 0;
        
        for (const seg of trench.segments) {
            if (!seg.built) continue;
            
            const segLength = seg.length;
            const numPositions = Math.floor(segLength / spacing);
            
            for (let i = 0; i <= numPositions; i++) {
                const t = numPositions > 0 ? i / numPositions : 0.5;
                positions.push({
                    x: seg.start.x + (seg.end.x - seg.start.x) * t,
                    y: seg.start.y + (seg.end.y - seg.start.y) * t
                });
            }
        }
        
        return positions;
    }
    
    getDistanceToTrench(x, y, trench) {
        let minDist = Infinity;
        for (const point of trench.points) {
            const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
            if (dist < minDist) minDist = dist;
        }
        return minDist;
    }
    
    findLeastCrowdedPosition(trenches, soldiers) {
        let bestPos = null;
        let maxMinDist = 0;
        
        for (const trench of trenches) {
            const positions = this.getTrenchPositions(trench, 15);
            
            for (const pos of positions) {
                let minDist = Infinity;
                
                for (const soldier of soldiers) {
                    const dist = Math.sqrt((soldier.x - pos.x) ** 2 + (soldier.y - pos.y) ** 2);
                    if (dist < minDist) minDist = dist;
                }
                
                if (minDist > maxMinDist) {
                    maxMinDist = minDist;
                    bestPos = { x: pos.x, y: pos.y, trench };
                }
            }
        }
        
        return bestPos;
    }
    
    // Damage trenches at a point (from explosions)
    damageTrenchesAtPoint(x, y, radius, damage) {
        for (const trench of this.trenches) {
            if (trench.isBlueprint) continue;
            
            for (const segment of trench.segments) {
                if (!segment.built || segment.destroyed) continue;
                
                // Check distance to segment midpoint
                const midX = (segment.start.x + segment.end.x) / 2;
                const midY = (segment.start.y + segment.end.y) / 2;
                const dist = Math.sqrt((midX - x) ** 2 + (midY - y) ** 2);
                
                if (dist < radius) {
                    const falloff = 1 - (dist / radius);
                    const actualDamage = damage * falloff;
                    
                    // Initialize health if not set
                    if (segment.health === undefined) {
                        segment.health = 100;
                        segment.maxHealth = 100;
                    }
                    
                    segment.health -= actualDamage;
                    
                    if (segment.health <= 0) {
                        segment.destroyed = true;
                        segment.damaged = false;
                        segment.health = 0;
                    } else if (segment.health < segment.maxHealth * 0.7) {
                        segment.damaged = true;
                    }
                }
            }
        }
    }
    
    // Find damaged trench segments for repair
    findDamagedTrench(x, y, team) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const trench of this.trenches) {
            if (trench.team !== team || trench.isBlueprint) continue;
            
            for (let i = 0; i < trench.segments.length; i++) {
                const seg = trench.segments[i];
                if (!seg.damaged && !seg.destroyed) continue;
                
                const midX = (seg.start.x + seg.end.x) / 2;
                const midY = (seg.start.y + seg.end.y) / 2;
                const dist = Math.sqrt((midX - x) ** 2 + (midY - y) ** 2);
                
                if (dist < minDist) {
                    minDist = dist;
                    nearest = {
                        type: seg.destroyed ? 'trench_rebuild' : 'trench',
                        target: trench,
                        segmentIndex: i,
                        x: midX,
                        y: midY
                    };
                }
            }
        }
        
        return nearest;
    }
    
    // Repair a damaged trench segment
    repairTrenchSegment(trench, segmentIndex, amount) {
        if (segmentIndex >= trench.segments.length) return true;
        
        const segment = trench.segments[segmentIndex];
        
        // Initialize health if not set
        if (segment.maxHealth === undefined) {
            segment.maxHealth = 100;
        }
        if (segment.health === undefined) {
            segment.health = segment.maxHealth;
        }
        
        if (segment.destroyed) {
            // Rebuilding destroyed segment
            segment.rebuildProgress = (segment.rebuildProgress || 0) + amount / segment.length;
            if (segment.rebuildProgress >= 1) {
                segment.destroyed = false;
                segment.damaged = false;
                segment.built = true;
                segment.health = segment.maxHealth;
                segment.rebuildProgress = 0;
                return true;
            }
        } else if (segment.damaged) {
            // Repairing damaged segment - restore health
            segment.health = Math.min(segment.maxHealth, segment.health + amount);
            if (segment.health >= segment.maxHealth * 0.7) {
                segment.damaged = false;
                segment.health = segment.maxHealth;
                return true;
            }
        } else {
            return true; // Already repaired
        }
        
        return false;
    }
    
    render(ctx) {
        // Sort trenches so we render blueprints last (on top)
        const sortedTrenches = [...this.trenches].sort((a, b) => {
            if (a.isBlueprint === b.isBlueprint) return 0;
            return a.isBlueprint ? 1 : -1;
        });
        
        for (const trench of sortedTrenches) {
            this.renderTrench(ctx, trench);
        }
    }
    
    renderTrench(ctx, trench) {
        if (trench.points.length < 2) return;
        
        const width = trench.width;
        
        // Draw each segment
        for (let i = 0; i < trench.segments.length; i++) {
            const segment = trench.segments[i];
            
            if (trench.isBlueprint) {
                // Blueprint - dashed outline with better visibility
                if (segment.progress > 0) {
                    // Partially built section
                    const partialEnd = {
                        x: segment.start.x + (segment.end.x - segment.start.x) * segment.progress,
                        y: segment.start.y + (segment.end.y - segment.start.y) * segment.progress
                    };
                    this.drawTrenchSegment(ctx, segment.start, partialEnd, width, false);
                }
                
                // Unbuilt portion - dashed outline
                ctx.strokeStyle = 'rgba(138, 122, 90, 0.5)';
                ctx.lineWidth = width;
                ctx.lineCap = 'round';
                ctx.setLineDash([12, 8]);
                
                ctx.beginPath();
                const startX = segment.start.x + (segment.end.x - segment.start.x) * segment.progress;
                const startY = segment.start.y + (segment.end.y - segment.start.y) * segment.progress;
                ctx.moveTo(startX, startY);
                ctx.lineTo(segment.end.x, segment.end.y);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Inner dashed line
                ctx.strokeStyle = 'rgba(26, 26, 10, 0.5)';
                ctx.lineWidth = width - 10;
                ctx.setLineDash([12, 8]);
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(segment.end.x, segment.end.y);
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                // Completed trench
                this.drawTrenchSegment(ctx, segment.start, segment.end, width, true);
            }
        }
    }
    
    drawTrenchSegment(ctx, start, end, width, complete) {
        // WWI style trenches with sandbag walls and duckboards
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 1) return;
        
        const nx = -dy / length;
        const ny = dx / length;
        
        // Shadow underneath the trench
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.moveTo(start.x + nx * (width/2 + 3) + 3, start.y + ny * (width/2 + 3) + 3);
        ctx.lineTo(end.x + nx * (width/2 + 3) + 3, end.y + ny * (width/2 + 3) + 3);
        ctx.lineTo(end.x - nx * (width/2 + 3) + 3, end.y - ny * (width/2 + 3) + 3);
        ctx.lineTo(start.x - nx * (width/2 + 3) + 3, start.y - ny * (width/2 + 3) + 3);
        ctx.closePath();
        ctx.fill();
        
        // Outer sandbag parapet (raised wall)
        const sandbagColor = complete ? CONFIG.COLORS.SANDBAG : CONFIG.COLORS.SANDBAG_DARK;
        ctx.strokeStyle = sandbagColor;
        ctx.lineWidth = width + 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        
        // Sandbag texture on parapet
        if (complete && length > 10) {
            this.drawSandbagParapet(ctx, start, end, width, length, nx, ny);
        }
        
        // Inner trench wall (darker earth)
        ctx.strokeStyle = CONFIG.COLORS.TRENCH_WALL;
        ctx.lineWidth = width - 6;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        
        // Trench floor (very dark)
        ctx.strokeStyle = CONFIG.COLORS.TRENCH;
        ctx.lineWidth = width - 12;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        
        // Duckboard walkway in center
        if (complete) {
            this.drawDuckboards(ctx, start, end, width, length, dx, dy, nx, ny);
        }
    }
    
    drawSandbagParapet(ctx, start, end, width, length, nx, ny) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        
        // Draw sandbag details on both sides
        const bagSpacing = 12;
        const bagCount = Math.floor(length / bagSpacing);
        
        for (let i = 0; i < bagCount; i++) {
            const t = (i + 0.5) / bagCount;
            const cx = start.x + dx * t;
            const cy = start.y + dy * t;
            
            // Outer edge sandbags (both sides)
            for (let side = -1; side <= 1; side += 2) {
                const bx = cx + nx * (width/2 + 1) * side;
                const by = cy + ny * (width/2 + 1) * side;
                
                // Sandbag shape
                ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
                ctx.beginPath();
                ctx.ellipse(bx + 1, by + 1, 5, 3, Math.atan2(dy, dx), 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = CONFIG.COLORS.SANDBAG;
                ctx.beginPath();
                ctx.ellipse(bx, by, 5, 3, Math.atan2(dy, dx), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    drawDuckboards(ctx, start, end, width, length, dx, dy, nx, ny) {
        // Wooden duckboard walkway
        const plankWidth = width - 16;
        const plankSpacing = 8;
        const plankCount = Math.floor(length / plankSpacing);
        
        for (let i = 0; i < plankCount; i++) {
            const t = (i + 0.5) / plankCount;
            const px = start.x + dx * t;
            const py = start.y + dy * t;
            
            // Plank shadow
            ctx.fillStyle = '#1a1505';
            ctx.save();
            ctx.translate(px + 1, py + 1);
            ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
            ctx.fillRect(-plankWidth/2, -2, plankWidth, 4);
            ctx.restore();
            
            // Main plank
            ctx.fillStyle = CONFIG.COLORS.DUCKBOARD;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
            ctx.fillRect(-plankWidth/2, -2, plankWidth, 4);
            
            // Plank highlight
            ctx.fillStyle = '#5a4a30';
            ctx.fillRect(-plankWidth/2 + 1, -1, plankWidth - 2, 1);
            
            // Nail details
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(-plankWidth/2 + 2, 0, 2, 2);
            ctx.fillRect(plankWidth/2 - 4, 0, 2, 2);
            
            ctx.restore();
        }
        
        // Side rails for duckboards
        ctx.strokeStyle = CONFIG.COLORS.TREE_TRUNK;
        ctx.lineWidth = 2;
        
        // Left rail
        ctx.beginPath();
        ctx.moveTo(start.x + nx * (plankWidth/2 - 2), start.y + ny * (plankWidth/2 - 2));
        ctx.lineTo(end.x + nx * (plankWidth/2 - 2), end.y + ny * (plankWidth/2 - 2));
        ctx.stroke();
        
        // Right rail
        ctx.beginPath();
        ctx.moveTo(start.x - nx * (plankWidth/2 - 2), start.y - ny * (plankWidth/2 - 2));
        ctx.lineTo(end.x - nx * (plankWidth/2 - 2), end.y - ny * (plankWidth/2 - 2));
        ctx.stroke();
    }
}

