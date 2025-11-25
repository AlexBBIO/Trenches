// Combat System - Shooting, damage, and morale
import { CONFIG } from './game.js';
import { UnitState } from './units.js';

export class CombatSystem {
    constructor(game) {
        this.game = game;
    }
    
    update(dt) {
        // Combat is mostly handled by individual units and buildings
        // This system handles global combat effects and checks
        
        // Check for units in melee range (charging)
        this.checkMeleeRange();
    }
    
    checkMeleeRange() {
        const units = this.game.unitManager.units;
        
        for (const unit of units) {
            if (unit.state === UnitState.DEAD) continue;
            if (unit.state !== UnitState.CHARGING) continue;
            
            // Check for enemies in melee range
            const meleeRange = 20;
            const enemies = this.game.unitManager.getEnemiesInRange(
                unit.x, unit.y, meleeRange, unit.team
            );
            
            for (const enemy of enemies) {
                // Melee attack!
                this.meleeAttack(unit, enemy);
            }
        }
    }
    
    meleeAttack(attacker, defender) {
        // Charging bonus
        const baseDamage = 40;
        const chargingBonus = attacker.state === UnitState.CHARGING ? 1.5 : 1;
        
        const damage = baseDamage * chargingBonus;
        
        this.dealDamage(defender, damage, attacker);
        
        // Both units fight
        if (defender.state !== UnitState.DEAD && Math.random() < 0.5) {
            this.dealDamage(attacker, baseDamage * 0.5, defender);
        }
        
        // Blood effects
        this.game.addEffect('blood', 
            (attacker.x + defender.x) / 2,
            (attacker.y + defender.y) / 2,
            { size: 15, duration: 2 }
        );
    }
    
    dealDamage(target, amount, source) {
        if (!target) return;
        
        // Check if target is a unit or building
        if (target.takeDamage) {
            // Unit - check if dead
            if (target.state === UnitState.DEAD) return;
            target.takeDamage(amount, source);
        } else if (target.health !== undefined && !target.destroyed) {
            // Building
            this.game.buildingManager.damageBuilding(target, amount);
        }
    }
    
    // Calculate damage to structures (trenches, buildings) in an area
    dealAreaDamage(x, y, radius, damage, source) {
        // Damage units
        const allUnits = this.game.unitManager.units;
        for (const unit of allUnits) {
            if (unit.state === UnitState.DEAD) continue;
            
            const dist = Math.sqrt((unit.x - x) ** 2 + (unit.y - y) ** 2);
            if (dist < radius) {
                const falloff = 1 - (dist / radius);
                const actualDamage = damage * falloff;
                this.dealDamage(unit, actualDamage, source);
            }
        }
        
        // Damage buildings
        for (const building of this.game.buildingManager.buildings) {
            if (building.destroyed) continue;
            
            const dist = Math.sqrt((building.x - x) ** 2 + (building.y - y) ** 2);
            if (dist < radius) {
                const falloff = 1 - (dist / radius);
                this.game.buildingManager.damageBuilding(building, damage * falloff * 0.5);
            }
        }
        
        // Damage trenches
        this.game.trenchSystem.damageTrenchesAtPoint(x, y, radius, damage * 0.3);
    }
    
    // Calculate morale effects
    applyMoraleEffects(unit, nearbyDeaths) {
        // Seeing allies die reduces morale
        unit.morale -= nearbyDeaths * 10;
        
        // Being suppressed reduces morale
        if (unit.suppression > 50) {
            unit.morale -= 5;
        }
        
        // Being in trench boosts morale
        if (this.game.trenchSystem.isInTrench(unit.x, unit.y, unit.team)) {
            unit.morale = Math.min(100, unit.morale + 2);
        }
        
        // Morale break - retreat!
        if (unit.morale <= 0 && unit.state !== UnitState.RETREATING) {
            this.forceRetreat(unit);
        }
    }
    
    forceRetreat(unit) {
        unit.morale = 30; // Recover some morale
        unit.setState(UnitState.RETREATING);
        
        // Find nearest trench to retreat to
        const nearestTrench = this.game.trenchSystem.findNearestTrench(
            unit.x, unit.y, unit.team
        );
        
        if (nearestTrench) {
            unit.moveTo(nearestTrench.x, nearestTrench.y);
        } else {
            // Retreat toward base
            const baseX = unit.team === CONFIG.TEAM_PLAYER ? 100 : CONFIG.MAP_WIDTH - 100;
            unit.moveTo(baseX, unit.y);
        }
    }
    
    // Calculate cover and line of sight
    hasLineOfSight(x1, y1, x2, y2) {
        // Simple implementation - could add obstacle checking later
        return true;
    }
    
    getCoverBonus(unit) {
        // In trench
        if (this.game.trenchSystem.isInTrench(unit.x, unit.y, unit.team)) {
            return 0.5; // 50% damage reduction
        }
        
        // Near friendly building
        for (const building of this.game.buildingManager.buildings) {
            if (building.team !== unit.team || building.destroyed) continue;
            
            const dist = Math.sqrt(
                (building.x - unit.x) ** 2 + (building.y - unit.y) ** 2
            );
            
            if (dist < building.radius + 10) {
                return 0.3; // 30% damage reduction
            }
        }
        
        return 0;
    }
}

