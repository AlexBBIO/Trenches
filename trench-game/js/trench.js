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
            connections: [], // Connected trench IDs
            health: 100,
            maxHealth: 100,
            damaged: false,
            destroyed: false
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
                built: false,
                health: 100,
                maxHealth: 100,
                damaged: false,
                destroyed: false
            });
        }
        
        trench.totalLength = trench.segments.reduce((sum, s) => sum + s.length, 0);
    }
    
    // Damage trenches at a point (from artillery)
    damageTrenchesAtPoint(x, y, radius, damage) {
        for (const trench of this.trenches) {
            if (trench.isBlueprint || trench.destroyed) continue;
            
            for (const segment of trench.segments) {
                if (!segment.built || segment.destroyed) continue;
                
                // Check distance from explosion to segment
                const dist = this.pointToSegmentDistance(x, y, segment.start, segment.end);
                
                if (dist < radius) {
                    const falloff = 1 - (dist / radius);
                    const segDamage = damage * falloff;
                    
                    segment.health -= segDamage;
                    segment.damaged = true;
                    trench.damaged = true;
                    
                    // Create dirt effect at damage point
                    const midX = (segment.start.x + segment.end.x) / 2;
                    const midY = (segment.start.y + segment.end.y) / 2;
                    this.game.addEffect('dirt', midX, midY, { size: 10, duration: 0.4 });
                    
                    if (segment.health <= 0) {
                        segment.destroyed = true;
                        segment.built = false;
                        this.game.addEffect('explosion', midX, midY, { size: 20, duration: 0.4 });
                    }
                }
            }
            
            // Check if all segments destroyed
            const allDestroyed = trench.segments.every(s => s.destroyed);
            if (allDestroyed) {
                trench.destroyed = true;
            }
            
            // Update trench health based on segment health
            if (trench.segments.length > 0) {
                const totalHealth = trench.segments.reduce((sum, s) => sum + Math.max(0, s.health), 0);
                const maxTotalHealth = trench.segments.length * 100;
                trench.health = (totalHealth / maxTotalHealth) * 100;
            }
        }
    }
    
    // Find damaged trench segment for repair
    findDamagedTrench(x, y, team) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const trench of this.trenches) {
            if (trench.team !== team || trench.isBlueprint) continue;
            
            for (let i = 0; i < trench.segments.length; i++) {
                const segment = trench.segments[i];
                
                // Check for damaged (but not destroyed) segments
                if (!segment.damaged || segment.destroyed) continue;
                if (segment.health >= segment.maxHealth) continue;
                
                const midX = (segment.start.x + segment.end.x) / 2;
                const midY = (segment.start.y + segment.end.y) / 2;
                
                const dist = Math.sqrt((midX - x) ** 2 + (midY - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { 
                        type: 'trench', 
                        target: trench, 
                        segmentIndex: i,
                        x: midX, 
                        y: midY 
                    };
                }
            }
            
            // Also check for destroyed segments that need rebuilding
            for (let i = 0; i < trench.segments.length; i++) {
                const segment = trench.segments[i];
                if (!segment.destroyed) continue;
                
                const midX = (segment.start.x + segment.end.x) / 2;
                const midY = (segment.start.y + segment.end.y) / 2;
                
                const dist = Math.sqrt((midX - x) ** 2 + (midY - y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { 
                        type: 'trench_rebuild', 
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
    
    // Repair a trench segment
    repairTrenchSegment(trench, segmentIndex, amount) {
        const segment = trench.segments[segmentIndex];
        if (!segment) return true;
        
        // If destroyed, need to rebuild
        if (segment.destroyed) {
            segment.progress += amount / (segment.length * 0.5); // Rebuild faster than initial build
            
            if (segment.progress >= 1) {
                segment.progress = 1;
                segment.built = true;
                segment.destroyed = false;
                segment.damaged = true; // Still needs repair
                segment.health = 30; // Start at partial health
                return true;
            }
            return false;
        }
        
        // Normal repair
        segment.health = Math.min(segment.maxHealth, segment.health + amount);
        
        if (segment.health >= segment.maxHealth) {
            segment.damaged = false;
            
            // Update trench damage status
            trench.damaged = trench.segments.some(s => s.damaged);
            trench.destroyed = false;
            
            // Update overall trench health
            const totalHealth = trench.segments.reduce((sum, s) => sum + Math.max(0, s.health), 0);
            const maxTotalHealth = trench.segments.length * 100;
            trench.health = (totalHealth / maxTotalHealth) * 100;
            
            return true; // Fully repaired
        }
        return false;
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
    
    render(ctx) {
        for (const trench of this.trenches) {
            this.renderTrench(ctx, trench);
        }
    }
    
    renderTrench(ctx, trench) {
        if (trench.points.length < 2) return;
        if (trench.destroyed) return; // Don't render fully destroyed trenches
        
        const width = trench.width;
        
        // Draw each segment
        for (let i = 0; i < trench.segments.length; i++) {
            const segment = trench.segments[i];
            
            // Skip destroyed segments (they'll show as gaps)
            if (segment.destroyed) {
                // Draw destroyed segment debris
                this.drawDestroyedSegment(ctx, segment);
                continue;
            }
            
            if (trench.isBlueprint) {
                // Blueprint - dashed outline
                if (segment.progress > 0) {
                    // Partially built
                    this.drawTrenchSegment(ctx, segment.start, {
                        x: segment.start.x + (segment.end.x - segment.start.x) * segment.progress,
                        y: segment.start.y + (segment.end.y - segment.start.y) * segment.progress
                    }, width, false, segment);
                }
                
                // Unbuilt portion
                ctx.strokeStyle = 'rgba(195, 176, 145, 0.4)';
                ctx.lineWidth = width;
                ctx.lineCap = 'round';
                ctx.setLineDash([10, 10]);
                
                ctx.beginPath();
                const startX = segment.start.x + (segment.end.x - segment.start.x) * segment.progress;
                const startY = segment.start.y + (segment.end.y - segment.start.y) * segment.progress;
                ctx.moveTo(startX, startY);
                ctx.lineTo(segment.end.x, segment.end.y);
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                // Completed trench - pass segment for damage rendering
                this.drawTrenchSegment(ctx, segment.start, segment.end, width, true, segment);
            }
        }
        
        // Draw health bar if damaged
        if (trench.damaged && !trench.isBlueprint && trench.health < trench.maxHealth * 0.9) {
            this.drawTrenchHealthBar(ctx, trench);
        }
    }
    
    // Draw destroyed trench segment (crater/rubble)
    drawDestroyedSegment(ctx, segment) {
        const midX = (segment.start.x + segment.end.x) / 2;
        const midY = (segment.start.y + segment.end.y) / 2;
        
        // Draw rebuilding progress if being repaired
        if (segment.progress > 0 && segment.progress < 1) {
            const builtEnd = {
                x: segment.start.x + (segment.end.x - segment.start.x) * segment.progress,
                y: segment.start.y + (segment.end.y - segment.start.y) * segment.progress
            };
            this.drawTrenchSegment(ctx, segment.start, builtEnd, 24, false, segment);
        }
        
        // Draw crater/debris for destroyed portion
        ctx.fillStyle = '#2a1a0a';
        ctx.beginPath();
        ctx.arc(midX, midY, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Scattered debris
        ctx.fillStyle = '#4a3a2a';
        for (let i = 0; i < 8; i++) {
            const ox = (Math.random() - 0.5) * 30;
            const oy = (Math.random() - 0.5) * 30;
            ctx.fillRect(midX + ox, midY + oy, 3 + Math.random() * 5, 3 + Math.random() * 5);
        }
    }
    
    // Draw health bar for damaged trench
    drawTrenchHealthBar(ctx, trench) {
        // Find center of trench for health bar
        const centerIdx = Math.floor(trench.points.length / 2);
        const centerPoint = trench.points[centerIdx];
        
        const barWidth = 40;
        const barHeight = 4;
        const healthPercent = trench.health / trench.maxHealth;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(centerPoint.x - barWidth / 2, centerPoint.y - 20, barWidth, barHeight);
        
        ctx.fillStyle = healthPercent > 0.5 ? '#4a4' : healthPercent > 0.25 ? '#aa4' : '#a44';
        ctx.fillRect(centerPoint.x - barWidth / 2, centerPoint.y - 20, barWidth * healthPercent, barHeight);
        
        // "DAMAGED" indicator
        if (healthPercent < 0.5) {
            ctx.fillStyle = '#ff4444';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('DAMAGED', centerPoint.x, centerPoint.y - 25);
        }
    }
    
    drawTrenchSegment(ctx, start, end, width, complete, segment = null) {
        // Dark WW1 style trenches
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 1) return;
        
        const nx = -dy / length;
        const ny = dx / length;
        
        // Check damage state
        const isDamaged = segment && segment.damaged && segment.health < segment.maxHealth;
        const healthPercent = segment ? segment.health / segment.maxHealth : 1;
        
        // Outer sandbag edge - dithered for pixel look
        let outerColor = complete ? CONFIG.COLORS.SANDBAG : '#5a5040';
        if (isDamaged) {
            // Darker color for damaged sections
            const darkFactor = 0.5 + healthPercent * 0.5;
            outerColor = this.darkenColor(CONFIG.COLORS.SANDBAG, darkFactor);
        }
        
        ctx.strokeStyle = outerColor;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        
        // Inner trench (dark pit)
        ctx.strokeStyle = CONFIG.COLORS.TRENCH;
        ctx.lineWidth = width - 10;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        
        // Even darker center
        ctx.strokeStyle = '#1a1a0a';
        ctx.lineWidth = width - 16;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        
        if (complete) {
            this.addTrenchDetail(ctx, start, end, width, length);
        }
        
        // Draw damage indicators
        if (isDamaged && healthPercent < 0.8) {
            this.drawDamageIndicators(ctx, start, end, length, healthPercent);
        }
    }
    
    // Darken a hex color
    darkenColor(hex, factor) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        const newR = Math.floor(r * factor);
        const newG = Math.floor(g * factor);
        const newB = Math.floor(b * factor);
        
        return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }
    
    // Draw damage indicators (craters, debris)
    drawDamageIndicators(ctx, start, end, length, healthPercent) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        
        // Number of damage marks based on damage level
        const damageMarks = Math.floor((1 - healthPercent) * 5);
        
        for (let i = 0; i < damageMarks; i++) {
            const t = (i + 0.5) / damageMarks;
            const x = start.x + dx * t;
            const y = start.y + dy * t;
            
            // Draw small crater/damage marks
            ctx.fillStyle = '#2a1a0a';
            ctx.beginPath();
            ctx.arc(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, 
                    3 + Math.random() * 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Debris
            ctx.fillStyle = '#4a3a2a';
            for (let j = 0; j < 3; j++) {
                const ox = (Math.random() - 0.5) * 15;
                const oy = (Math.random() - 0.5) * 15;
                ctx.fillRect(x + ox, y + oy, 2 + Math.random() * 3, 2 + Math.random() * 3);
            }
        }
    }
    
    addTrenchDetail(ctx, start, end, width, length) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        
        // Duckboard planks
        ctx.strokeStyle = '#3a2a1a';
        ctx.lineWidth = 2;
        
        const plankCount = Math.floor(length / 10);
        for (let i = 1; i < plankCount; i++) {
            const t = i / plankCount;
            const x = start.x + dx * t;
            const y = start.y + dy * t;
            const nx = -dy / length;
            const ny = dx / length;
            
            ctx.beginPath();
            ctx.moveTo(x - nx * 5, y - ny * 5);
            ctx.lineTo(x + nx * 5, y + ny * 5);
            ctx.stroke();
        }
    }
}

