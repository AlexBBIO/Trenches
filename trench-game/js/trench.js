// Trench System - Trench drawing, building, and pathfinding
import { CONFIG } from './game.js';

export class TrenchSystem {
    constructor(game) {
        this.game = game;
        this.trenches = [];
        this.trenchIdCounter = 0;
        this.claimedSegments = new Map(); // Map of "trenchId-segIdx" -> workerId
        this.networks = []; // Networks of connected trenches
        this.junctions = []; // Junction points where trenches meet
    }
    
    clear() {
        this.trenches = [];
        this.networks = [];
        this.junctions = [];
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
    
    // Phase 1: Build networks of connected trenches
    buildTrenchNetworks() {
        this.networks = [];
        this.junctions = [];
        
        // Group trenches by team first
        const playerTrenches = this.trenches.filter(t => t.team === CONFIG.TEAM_PLAYER);
        const enemyTrenches = this.trenches.filter(t => t.team === CONFIG.TEAM_ENEMY);
        
        // Build networks for each team
        this.buildNetworksForTeam(playerTrenches);
        this.buildNetworksForTeam(enemyTrenches);
        
        // Find junction points
        this.findJunctions();
        
        return this.networks;
    }
    
    buildNetworksForTeam(teamTrenches) {
        const visited = new Set();
        
        for (const trench of teamTrenches) {
            if (visited.has(trench.id)) continue;
            
            // BFS to find all connected trenches
            const network = {
                trenches: [],
                team: trench.team,
                points: [], // All unique points in the network
                segments: [] // All segments for unified rendering
            };
            
            const queue = [trench];
            while (queue.length > 0) {
                const current = queue.shift();
                if (visited.has(current.id)) continue;
                
                visited.add(current.id);
                network.trenches.push(current);
                
                // Add connected trenches to queue
                for (const connectedId of current.connections) {
                    const connected = this.trenches.find(t => t.id === connectedId);
                    if (connected && !visited.has(connected.id)) {
                        queue.push(connected);
                    }
                }
            }
            
            // Build unified segment list for this network
            this.buildNetworkSegments(network);
            
            this.networks.push(network);
        }
    }
    
    buildNetworkSegments(network) {
        network.segments = [];
        network.points = [];
        
        const pointMap = new Map(); // Key: "x,y" -> point index
        
        for (const trench of network.trenches) {
            for (const segment of trench.segments) {
                // Add segment to network
                network.segments.push({
                    start: segment.start,
                    end: segment.end,
                    length: segment.length,
                    built: segment.built,
                    progress: segment.progress,
                    trench: trench
                });
                
                // Track unique points
                const startKey = `${Math.round(segment.start.x)},${Math.round(segment.start.y)}`;
                const endKey = `${Math.round(segment.end.x)},${Math.round(segment.end.y)}`;
                
                if (!pointMap.has(startKey)) {
                    pointMap.set(startKey, { 
                        x: segment.start.x, 
                        y: segment.start.y, 
                        connections: [] 
                    });
                }
                if (!pointMap.has(endKey)) {
                    pointMap.set(endKey, { 
                        x: segment.end.x, 
                        y: segment.end.y, 
                        connections: [] 
                    });
                }
                
                // Track connections for junction detection
                const startPoint = pointMap.get(startKey);
                const endPoint = pointMap.get(endKey);
                startPoint.connections.push({ segment, end: endPoint });
                endPoint.connections.push({ segment, end: startPoint });
            }
        }
        
        network.points = Array.from(pointMap.values());
    }
    
    findJunctions() {
        this.junctions = [];
        
        for (const network of this.networks) {
            for (const point of network.points) {
                if (point.connections.length >= 3) {
                    // T-junction or crossroad (3+ segments)
                    this.junctions.push({
                        x: point.x,
                        y: point.y,
                        type: point.connections.length === 3 ? 't-junction' : 'crossroad',
                        connections: point.connections,
                        team: network.team
                    });
                } else if (point.connections.length === 2) {
                    // Check if it's an elbow (significant angle change)
                    const conn1 = point.connections[0];
                    const conn2 = point.connections[1];
                    
                    // Get direction vectors from this point to connected endpoints
                    const dir1 = {
                        x: conn1.end.x - point.x,
                        y: conn1.end.y - point.y
                    };
                    const dir2 = {
                        x: conn2.end.x - point.x,
                        y: conn2.end.y - point.y
                    };
                    
                    const len1 = Math.sqrt(dir1.x * dir1.x + dir1.y * dir1.y);
                    const len2 = Math.sqrt(dir2.x * dir2.x + dir2.y * dir2.y);
                    
                    if (len1 > 0.1 && len2 > 0.1) {
                        // Normalize
                        dir1.x /= len1; dir1.y /= len1;
                        dir2.x /= len2; dir2.y /= len2;
                        
                        // Calculate angle between directions
                        const dot = dir1.x * dir2.x + dir1.y * dir2.y;
                        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                        
                        // If angle is significant (not nearly straight), it's an elbow
                        // Nearly straight would be dot close to -1 (180 degrees)
                        if (dot > -0.85) { // More than ~30 degree deviation from straight
                            this.junctions.push({
                                x: point.x,
                                y: point.y,
                                type: 'elbow',
                                angle: angle,
                                connections: point.connections,
                                team: network.team
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Phase 2: Compute polygon outline for a trench segment
    computeTrenchPolygon(start, end, width) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length < 0.1) {
            return null;
        }
        
        // Perpendicular normal vector
        const nx = -dy / length;
        const ny = dx / length;
        
        const halfWidth = width / 2;
        
        // Four corners of the segment polygon
        return {
            leftStart: { x: start.x + nx * halfWidth, y: start.y + ny * halfWidth },
            rightStart: { x: start.x - nx * halfWidth, y: start.y - ny * halfWidth },
            leftEnd: { x: end.x + nx * halfWidth, y: end.y + ny * halfWidth },
            rightEnd: { x: end.x - nx * halfWidth, y: end.y - ny * halfWidth },
            normal: { x: nx, y: ny },
            direction: { x: dx / length, y: dy / length }
        };
    }
    
    // Compute miter point where two segments meet at a corner
    computeMiterPoint(p1, p2, p3, width, side) {
        // Direction vectors
        const d1x = p2.x - p1.x;
        const d1y = p2.y - p1.y;
        const d2x = p3.x - p2.x;
        const d2y = p3.y - p2.y;
        
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
        const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
        
        if (len1 < 0.1 || len2 < 0.1) {
            return { x: p2.x, y: p2.y };
        }
        
        // Normalized directions
        const dir1 = { x: d1x / len1, y: d1y / len1 };
        const dir2 = { x: d2x / len2, y: d2y / len2 };
        
        // Normals (perpendicular)
        const n1 = { x: -dir1.y * side, y: dir1.x * side };
        const n2 = { x: -dir2.y * side, y: dir2.x * side };
        
        // Average normal for miter direction
        const avgNx = n1.x + n2.x;
        const avgNy = n1.y + n2.y;
        const avgLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy);
        
        if (avgLen < 0.1) {
            // Parallel segments, no miter needed
            return {
                x: p2.x + n1.x * width / 2,
                y: p2.y + n1.y * width / 2
            };
        }
        
        const avgN = { x: avgNx / avgLen, y: avgNy / avgLen };
        
        // Calculate miter length based on angle between segments
        const dot = dir1.x * dir2.x + dir1.y * dir2.y;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        
        // Miter length formula: width / (2 * sin(angle/2))
        const miterLen = (width / 2) / Math.max(0.3, Math.sin(angle / 2));
        
        // Limit miter length to prevent spikes on sharp angles
        const limitedMiterLen = Math.min(miterLen, width * 2);
        
        return {
            x: p2.x + avgN.x * limitedMiterLen,
            y: p2.y + avgN.y * limitedMiterLen
        };
    }
    
    // Generate polygon points for an entire trench path
    generateTrenchOutline(points, width) {
        if (points.length < 2) return { left: [], right: [] };
        
        const halfWidth = width / 2;
        const leftPoints = [];
        const rightPoints = [];
        
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const prev = i > 0 ? points[i - 1] : null;
            const next = i < points.length - 1 ? points[i + 1] : null;
            
            if (prev && next) {
                // Middle point - compute miter
                leftPoints.push(this.computeMiterPoint(prev, p, next, width, 1));
                rightPoints.push(this.computeMiterPoint(prev, p, next, width, -1));
            } else if (next) {
                // Start point
                const dx = next.x - p.x;
                const dy = next.y - p.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0.1) {
                    const nx = -dy / len;
                    const ny = dx / len;
                    leftPoints.push({ x: p.x + nx * halfWidth, y: p.y + ny * halfWidth });
                    rightPoints.push({ x: p.x - nx * halfWidth, y: p.y - ny * halfWidth });
                }
            } else if (prev) {
                // End point
                const dx = p.x - prev.x;
                const dy = p.y - prev.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0.1) {
                    const nx = -dy / len;
                    const ny = dx / len;
                    leftPoints.push({ x: p.x + nx * halfWidth, y: p.y + ny * halfWidth });
                    rightPoints.push({ x: p.x - nx * halfWidth, y: p.y - ny * halfWidth });
                }
            }
        }
        
        return { left: leftPoints, right: rightPoints };
    }
    
    // Create a closed polygon path from left and right outlines
    createClosedPolygon(leftPoints, rightPoints) {
        // Polygon goes: left points forward, right points backward
        const polygon = [...leftPoints];
        for (let i = rightPoints.length - 1; i >= 0; i--) {
            polygon.push(rightPoints[i]);
        }
        return polygon;
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
    
    // Find nearest point on any trench segment (for building connections)
    findNearestTrenchPoint(x, y, team) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const trench of this.trenches) {
            if (trench.team !== team || trench.isBlueprint) continue;
            
            for (const segment of trench.segments) {
                if (!segment.built || segment.destroyed) continue;
                
                // Find closest point on this segment
                const closestPoint = this.getClosestPointOnSegment(x, y, segment.start, segment.end);
                const dist = Math.sqrt((closestPoint.x - x) ** 2 + (closestPoint.y - y) ** 2);
                
                if (dist < minDist) {
                    minDist = dist;
                    nearest = {
                        x: closestPoint.x,
                        y: closestPoint.y,
                        distance: dist,
                        trench
                    };
                }
            }
        }
        
        return nearest;
    }
    
    // Get closest point on a line segment to a given point
    getClosestPointOnSegment(px, py, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq === 0) {
            return { x: a.x, y: a.y };
        }
        
        let t = ((px - a.x) * dx + (py - a.y) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        
        return {
            x: a.x + t * dx,
            y: a.y + t * dy
        };
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
        // Build networks for seamless rendering
        this.buildTrenchNetworks();
        
        // Separate blueprints from completed trenches
        const blueprintTrenches = this.trenches.filter(t => t.isBlueprint);
        const completedTrenches = this.trenches.filter(t => !t.isBlueprint);
        
        // LAYER 1: Render all blueprint trenches first (dashed, underneath)
        for (const trench of blueprintTrenches) {
            this.renderBlueprintTrench(ctx, trench);
        }
        
        // For completed trenches, render in layers across ALL trenches
        // This prevents visible seams at segment joints
        
        // LAYER 2: All shadows
        for (const trench of completedTrenches) {
            this.renderTrenchShadowLayer(ctx, trench);
        }
        
        // LAYER 3: All parapets (outer sandbag wall)
        for (const trench of completedTrenches) {
            this.renderTrenchParapetLayer(ctx, trench);
        }
        
        // LAYER 4: All inner walls
        for (const trench of completedTrenches) {
            this.renderTrenchWallLayer(ctx, trench);
        }
        
        // LAYER 5: All floors
        for (const trench of completedTrenches) {
            this.renderTrenchFloorLayer(ctx, trench);
        }
        
        // LAYER 6: Junction hubs (render over floor to cover seams)
        this.renderJunctions(ctx);
        
        // LAYER 7: All decorations (sandbags, duckboards)
        for (const trench of completedTrenches) {
            this.renderTrenchDecorations(ctx, trench);
        }
    }
    
    renderBlueprintTrench(ctx, trench) {
        if (trench.points.length < 2) return;
        
        const width = trench.width;
        
        for (const segment of trench.segments) {
            // Built portion (if any progress)
            if (segment.progress > 0) {
                const partialEnd = {
                    x: segment.start.x + (segment.end.x - segment.start.x) * segment.progress,
                    y: segment.start.y + (segment.end.y - segment.start.y) * segment.progress
                };
                this.drawTrenchSegmentComplete(ctx, segment.start, partialEnd, width);
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
        }
    }
    
    // LAYER 2: Shadow layer - unified shadow for entire trench
    renderTrenchShadowLayer(ctx, trench) {
        if (trench.points.length < 2) return;
        
        const width = trench.width;
        const shadowOffset = 3;
        const shadowExpand = 3;
        
        // Generate outline for entire trench
        const outline = this.generateTrenchOutline(trench.points, width + shadowExpand * 2);
        
        if (outline.left.length < 2) return;
        
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        
        // Draw left side offset for shadow
        ctx.moveTo(outline.left[0].x + shadowOffset, outline.left[0].y + shadowOffset);
        for (let i = 1; i < outline.left.length; i++) {
            ctx.lineTo(outline.left[i].x + shadowOffset, outline.left[i].y + shadowOffset);
        }
        
        // Draw right side reversed
        for (let i = outline.right.length - 1; i >= 0; i--) {
            ctx.lineTo(outline.right[i].x + shadowOffset, outline.right[i].y + shadowOffset);
        }
        
        ctx.closePath();
        ctx.fill();
    }
    
    // LAYER 3: Parapet layer - outer sandbag wall as unified polygon
    renderTrenchParapetLayer(ctx, trench) {
        if (trench.points.length < 2) return;
        
        const width = trench.width + 4; // Parapet is slightly wider
        
        // Generate outline for entire trench
        const outline = this.generateTrenchOutline(trench.points, width);
        
        if (outline.left.length < 2) return;
        
        ctx.fillStyle = CONFIG.COLORS.SANDBAG;
        ctx.beginPath();
        
        ctx.moveTo(outline.left[0].x, outline.left[0].y);
        for (let i = 1; i < outline.left.length; i++) {
            ctx.lineTo(outline.left[i].x, outline.left[i].y);
        }
        
        for (let i = outline.right.length - 1; i >= 0; i--) {
            ctx.lineTo(outline.right[i].x, outline.right[i].y);
        }
        
        ctx.closePath();
        ctx.fill();
    }
    
    // LAYER 4: Wall layer - inner earth wall
    renderTrenchWallLayer(ctx, trench) {
        if (trench.points.length < 2) return;
        
        const width = trench.width - 6;
        
        const outline = this.generateTrenchOutline(trench.points, width);
        
        if (outline.left.length < 2) return;
        
        ctx.fillStyle = CONFIG.COLORS.TRENCH_WALL;
        ctx.beginPath();
        
        ctx.moveTo(outline.left[0].x, outline.left[0].y);
        for (let i = 1; i < outline.left.length; i++) {
            ctx.lineTo(outline.left[i].x, outline.left[i].y);
        }
        
        for (let i = outline.right.length - 1; i >= 0; i--) {
            ctx.lineTo(outline.right[i].x, outline.right[i].y);
        }
        
        ctx.closePath();
        ctx.fill();
    }
    
    // LAYER 5: Floor layer - dark trench interior
    renderTrenchFloorLayer(ctx, trench) {
        if (trench.points.length < 2) return;
        
        const width = trench.width - 12;
        
        const outline = this.generateTrenchOutline(trench.points, width);
        
        if (outline.left.length < 2) return;
        
        ctx.fillStyle = CONFIG.COLORS.TRENCH;
        ctx.beginPath();
        
        ctx.moveTo(outline.left[0].x, outline.left[0].y);
        for (let i = 1; i < outline.left.length; i++) {
            ctx.lineTo(outline.left[i].x, outline.left[i].y);
        }
        
        for (let i = outline.right.length - 1; i >= 0; i--) {
            ctx.lineTo(outline.right[i].x, outline.right[i].y);
        }
        
        ctx.closePath();
        ctx.fill();
    }
    
    // LAYER 6: Render junction hubs where multiple trenches meet
    renderJunctions(ctx) {
        for (const junction of this.junctions) {
            this.renderJunctionHub(ctx, junction);
        }
    }
    
    renderJunctionHub(ctx, junction) {
        const maxWidth = 24; // Default trench width
        
        if (junction.type === 'elbow') {
            this.renderElbowJunction(ctx, junction, maxWidth);
        } else {
            // T-junction or crossroad - render circular hub
            this.renderCircularHub(ctx, junction, maxWidth);
        }
    }
    
    renderCircularHub(ctx, junction, width) {
        const hubRadius = width / 2 + 2;
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.arc(junction.x + 3, junction.y + 3, hubRadius + 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Parapet (sandbag) ring
        ctx.fillStyle = CONFIG.COLORS.SANDBAG;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, hubRadius + 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Wall ring
        ctx.fillStyle = CONFIG.COLORS.TRENCH_WALL;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, hubRadius - 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Floor
        ctx.fillStyle = CONFIG.COLORS.TRENCH;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, hubRadius - 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Add sandbag details around the hub
        const sandbagCount = junction.type === 'crossroad' ? 8 : 6;
        for (let i = 0; i < sandbagCount; i++) {
            const angle = (i / sandbagCount) * Math.PI * 2;
            const bx = junction.x + Math.cos(angle) * (hubRadius + 1);
            const by = junction.y + Math.sin(angle) * (hubRadius + 1);
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG_DARK;
            ctx.beginPath();
            ctx.ellipse(bx + 1, by + 1, 5, 3, angle, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = CONFIG.COLORS.SANDBAG;
            ctx.beginPath();
            ctx.ellipse(bx, by, 5, 3, angle, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    renderElbowJunction(ctx, junction, width) {
        // For elbows, render a smooth curved corner patch
        const radius = width / 2;
        
        // Shadow arc
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.arc(junction.x + 3, junction.y + 3, radius + 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Parapet arc
        ctx.fillStyle = CONFIG.COLORS.SANDBAG;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, radius + 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Wall arc
        ctx.fillStyle = CONFIG.COLORS.TRENCH_WALL;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, radius - 1, 0, Math.PI * 2);
        ctx.fill();
        
        // Floor arc
        ctx.fillStyle = CONFIG.COLORS.TRENCH;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, radius - 4, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // LAYER 7: Decorations - sandbags and duckboards
    renderTrenchDecorations(ctx, trench) {
        if (trench.points.length < 2) return;
        
        const width = trench.width;
        
        // Draw sandbag details and duckboards for each segment
        for (const segment of trench.segments) {
            if (!segment.built) continue;
            
            const dx = segment.end.x - segment.start.x;
            const dy = segment.end.y - segment.start.y;
            const length = segment.length;
            
            if (length < 10) continue;
            
            const nx = -dy / length;
            const ny = dx / length;
            
            // Draw sandbag parapet details
            this.drawSandbagParapet(ctx, segment.start, segment.end, width, length, nx, ny);
            
            // Draw duckboards
            this.drawDuckboards(ctx, segment.start, segment.end, width, length, dx, dy, nx, ny);
        }
    }
    
    // Helper method for drawing complete trench segment (used for partial blueprint builds)
    drawTrenchSegmentComplete(ctx, start, end, width) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 1) return;
        
        const nx = -dy / length;
        const ny = dx / length;
        
        // Shadow
        ctx.fillStyle = CONFIG.COLORS.SHADOW;
        ctx.beginPath();
        ctx.moveTo(start.x + nx * (width/2 + 3) + 3, start.y + ny * (width/2 + 3) + 3);
        ctx.lineTo(end.x + nx * (width/2 + 3) + 3, end.y + ny * (width/2 + 3) + 3);
        ctx.lineTo(end.x - nx * (width/2 + 3) + 3, end.y - ny * (width/2 + 3) + 3);
        ctx.lineTo(start.x - nx * (width/2 + 3) + 3, start.y - ny * (width/2 + 3) + 3);
        ctx.closePath();
        ctx.fill();
        
        // Parapet
        ctx.fillStyle = CONFIG.COLORS.SANDBAG;
        ctx.beginPath();
        ctx.moveTo(start.x + nx * (width/2 + 2), start.y + ny * (width/2 + 2));
        ctx.lineTo(end.x + nx * (width/2 + 2), end.y + ny * (width/2 + 2));
        ctx.lineTo(end.x - nx * (width/2 + 2), end.y - ny * (width/2 + 2));
        ctx.lineTo(start.x - nx * (width/2 + 2), start.y - ny * (width/2 + 2));
        ctx.closePath();
        ctx.fill();
        
        // Wall
        ctx.fillStyle = CONFIG.COLORS.TRENCH_WALL;
        ctx.beginPath();
        ctx.moveTo(start.x + nx * (width/2 - 3), start.y + ny * (width/2 - 3));
        ctx.lineTo(end.x + nx * (width/2 - 3), end.y + ny * (width/2 - 3));
        ctx.lineTo(end.x - nx * (width/2 - 3), end.y - ny * (width/2 - 3));
        ctx.lineTo(start.x - nx * (width/2 - 3), start.y - ny * (width/2 - 3));
        ctx.closePath();
        ctx.fill();
        
        // Floor
        ctx.fillStyle = CONFIG.COLORS.TRENCH;
        ctx.beginPath();
        ctx.moveTo(start.x + nx * (width/2 - 6), start.y + ny * (width/2 - 6));
        ctx.lineTo(end.x + nx * (width/2 - 6), end.y + ny * (width/2 - 6));
        ctx.lineTo(end.x - nx * (width/2 - 6), end.y - ny * (width/2 - 6));
        ctx.lineTo(start.x - nx * (width/2 - 6), start.y - ny * (width/2 - 6));
        ctx.closePath();
        ctx.fill();
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

