// Input Module - Mouse and keyboard handling
import { CONFIG } from './game.js';

export class Input {
    constructor(game) {
        this.game = game;
        this.renderer = game.renderer;
        
        // Mouse state
        this.mouseX = 0;
        this.mouseY = 0;
        this.worldX = 0;
        this.worldY = 0;
        this.mouseDown = false;
        this.rightMouseDown = false;
        
        // Keyboard state
        this.keys = {};
        
        // Selection dragging
        this.isDraggingSelection = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionEnd = { x: 0, y: 0 };
        
        // Trench drawing
        this.isDrawingTrench = false;
        this.trenchPoints = [];
        
        // Barbed wire drawing
        this.isDrawingWire = false;
        this.wirePoints = [];
        
        // Building preview
        this.buildPreview = null;
        
        // Camera panning with middle mouse or edge scroll
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        
        // Double click detection
        this.lastClickTime = 0;
        this.lastClickedUnitId = null;
        
        // Bind event handlers
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        
        // Attach listeners
        const canvas = game.canvas;
        canvas.addEventListener('mousedown', this.onMouseDown);
        canvas.addEventListener('mouseup', this.onMouseUp);
        canvas.addEventListener('mousemove', this.onMouseMove);
        canvas.addEventListener('wheel', this.onWheel);
        canvas.addEventListener('contextmenu', this.onContextMenu);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }
    
    onMouseDown(e) {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        this.updateWorldCoords();
        
        if (e.button === 0) { // Left click
            this.mouseDown = true;
            this.handleLeftClick();
        } else if (e.button === 1) { // Middle click
            e.preventDefault();
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.game.canvas.style.cursor = 'grabbing';
        } else if (e.button === 2) { // Right click
            this.rightMouseDown = true;
            this.handleRightClick();
        }
    }
    
    onMouseUp(e) {
        if (e.button === 0) {
            this.mouseDown = false;
            this.handleLeftRelease();
        } else if (e.button === 1) {
            this.isPanning = false;
            this.game.canvas.style.cursor = '';
        } else if (e.button === 2) {
            this.rightMouseDown = false;
        }
    }
    
    onMouseMove(e) {
        const dx = e.clientX - this.mouseX;
        const dy = e.clientY - this.mouseY;
        
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        this.updateWorldCoords();
        
        // Middle mouse panning
        if (this.isPanning) {
            // Move camera in opposite direction of mouse to simulate dragging the ground
            this.renderer.pan(-dx, -dy);
            return;
        }
        
        // Selection drag
        if (this.isDraggingSelection) {
            this.selectionEnd = { x: this.worldX, y: this.worldY };
        }
        
        // Trench drawing
        if (this.isDrawingTrench) {
            this.addTrenchPoint();
        }
        
        // Wire drawing
        if (this.isDrawingWire) {
            this.addWirePoint();
        }
        
        // Building preview for all building types
        const buildingTools = [
            'machinegun', 'artillery', 'barbed',
            'medical_tent', 'bunker', 'observation_post', 
            'supply_depot', 'mortar'
        ];
        if (buildingTools.includes(this.game.currentTool)) {
            this.buildPreview = {
                type: this.game.currentTool,
                x: this.worldX,
                y: this.worldY
            };
        } else {
            this.buildPreview = null;
        }
    }
    
    onWheel(e) {
        e.preventDefault();
        // Zoom based on scroll direction
        const delta = e.deltaY > 0 ? -1 : 1;
        this.renderer.zoom(delta, e.clientX, e.clientY);
    }
    
    onKeyDown(e) {
        const key = e.key.toLowerCase();
        this.keys[key] = true;
        
        // Only process when game is playing
        if (this.game.state !== 'playing') return;
        
        // Escape to deselect
        if (key === 'escape') {
            this.game.setTool('select');
            this.game.clearSelection();
        }
        
        // Quick select hotkeys (Shift + S/W)
        if (e.shiftKey) {
            if (key === 's') {
                e.preventDefault();
                this.game.ui.selectAllOfType('soldier');
            } else if (key === 'w') {
                e.preventDefault();
                this.game.ui.selectAllOfType('worker');
            }
        }
        
        // Tool hotkeys (1-0)
        const toolHotkeys = {
            '1': 'select',
            'q': 'select',
            '2': 'trench',
            't': 'trench',
            '3': 'machinegun',
            'm': 'machinegun',
            '4': 'artillery',
            '5': 'barbed',
            'b': 'barbed',
            '6': 'medical_tent',
            '7': 'bunker',
            '8': 'observation_post',
            '9': 'supply_depot',
            '0': 'mortar'
        };
        
        if (toolHotkeys[key] && !e.shiftKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            this.game.setTool(toolHotkeys[key]);
        }
    }
    
    onKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
    }
    
    onContextMenu(e) {
        e.preventDefault();
    }
    
    updateWorldCoords() {
        this.worldX = this.renderer.screenToWorldX(this.mouseX);
        this.worldY = this.renderer.screenToWorldY(this.mouseY);
    }
    
    handleLeftClick() {
        const tool = this.game.currentTool;
        
        switch (tool) {
            case 'select':
                this.startSelection();
                break;
            case 'trench':
                this.startTrench();
                break;
            case 'machinegun':
            case 'artillery':
            case 'medical_tent':
            case 'bunker':
            case 'observation_post':
            case 'supply_depot':
            case 'mortar':
                this.placeBuilding(tool);
                break;
            case 'barbed':
                this.startWire();
                break;
        }
    }
    
    handleLeftRelease() {
        if (this.isDraggingSelection) {
            this.finishSelection();
        }
        
        if (this.isDrawingTrench) {
            this.finishTrench();
        }
        
        if (this.isDrawingWire) {
            this.finishWire();
        }
    }
    
    handleRightClick() {
        // Right click commands for selected units
        if (this.game.selectedUnits.length === 0) return;
        
        // Check if clicking on enemy
        const target = this.game.unitManager.getUnitAt(this.worldX, this.worldY);
        
        if (target && target.team !== CONFIG.TEAM_PLAYER) {
            // Attack command
            this.game.selectedUnits.forEach(unit => {
                if (unit.type === 'soldier') {
                    unit.attackTargetUnit(target);
                }
            });
            return;
        }
        
        // Check if clicking on a trench - order units to man it
        const trench = this.game.trenchSystem.isInTrench(this.worldX, this.worldY, CONFIG.TEAM_PLAYER);
        
        if (trench) {
            // Order soldiers and workers to the trench
            const units = this.game.selectedUnits.filter(u => u.type === 'soldier' || u.type === 'worker');
            units.forEach((unit, i) => {
                // Find position along trench
                const trenchPos = this.game.trenchSystem.getPositionAlongTrench(trench, i, units.length);
                if (trenchPos) {
                    unit.orderToTrench(trenchPos.x, trenchPos.y, trench);
                }
            });
            return;
        }
        
        // Regular move command
        this.game.selectedUnits.forEach((unit, i) => {
            // Spread out units in formation
            const cols = Math.ceil(Math.sqrt(this.game.selectedUnits.length));
            const row = Math.floor(i / cols);
            const col = i % cols;
            const offsetX = (col - cols / 2) * 15;
            const offsetY = row * 15;
            unit.moveTo(this.worldX + offsetX, this.worldY + offsetY);
        });
    }
    
    startSelection() {
        // Check if clicking on a unit first
        const clickedUnit = this.game.unitManager.getUnitAt(this.worldX, this.worldY);
        
        if (clickedUnit && clickedUnit.team === CONFIG.TEAM_PLAYER) {
            // Check for double click
            const now = Date.now();
            if (this.lastClickedUnitId === clickedUnit.id && (now - this.lastClickTime) < 300) {
                // Double click! Select all unassigned of this type
                this.game.ui.selectAllUnassignedOfType(clickedUnit.type);
                this.lastClickTime = 0;
                this.lastClickedUnitId = null;
                return;
            }
            
            // Update click tracking
            this.lastClickTime = now;
            this.lastClickedUnitId = clickedUnit.id;
            
            // Deselect any building
            this.game.ui.deselectBuilding();
            
            // Select just this unit
            if (this.keys['shift']) {
                // Add to selection
                if (!clickedUnit.selected) {
                    this.game.selectedUnits.push(clickedUnit);
                    clickedUnit.selected = true;
                    this.game.ui.updateSelection(this.game.selectedUnits);
                }
            } else {
                // Select only this unit
                this.game.selectUnits([clickedUnit]);
            }
            return;
        }
        
        // Reset double click tracking if we didn't click a friendly unit
        this.lastClickedUnitId = null;
        
        // Check if clicking on a building
        const clickedBuilding = this.game.buildingManager.getBuildingAt(this.worldX, this.worldY);
        
        if (clickedBuilding && clickedBuilding.team === CONFIG.TEAM_PLAYER && !clickedBuilding.isBlueprint) {
            // Select the building
            this.game.ui.selectBuilding(clickedBuilding);
            return;
        }
        
        // Deselect building when clicking elsewhere
        this.game.ui.deselectBuilding();
        
        // Start box selection
        this.isDraggingSelection = true;
        this.selectionStart = { x: this.worldX, y: this.worldY };
        this.selectionEnd = { x: this.worldX, y: this.worldY };
        
        if (!this.keys['shift']) {
            this.game.clearSelection();
        }
    }
    
    finishSelection() {
        this.isDraggingSelection = false;
        
        const x1 = Math.min(this.selectionStart.x, this.selectionEnd.x);
        const y1 = Math.min(this.selectionStart.y, this.selectionEnd.y);
        const x2 = Math.max(this.selectionStart.x, this.selectionEnd.x);
        const y2 = Math.max(this.selectionStart.y, this.selectionEnd.y);
        
        // Find units in box
        const units = this.game.unitManager.getUnitsInBox(x1, y1, x2, y2);
        
        if (this.keys['shift']) {
            // Add to existing selection
            units.forEach(unit => {
                if (!unit.selected && unit.team === CONFIG.TEAM_PLAYER) {
                    this.game.selectedUnits.push(unit);
                    unit.selected = true;
                }
            });
            this.game.ui.updateSelection(this.game.selectedUnits);
        } else {
            this.game.selectUnits(units);
        }
    }
    
    startTrench() {
        this.isDrawingTrench = true;
        this.trenchPoints = [{ x: this.worldX, y: this.worldY }];
    }
    
    addTrenchPoint() {
        if (!this.isDrawingTrench) return;
        
        const lastPoint = this.trenchPoints[this.trenchPoints.length - 1];
        const dist = Math.sqrt(
            (this.worldX - lastPoint.x) ** 2 + 
            (this.worldY - lastPoint.y) ** 2
        );
        
        // Add point every 20 pixels
        if (dist >= 20) {
            this.trenchPoints.push({ x: this.worldX, y: this.worldY });
        }
    }
    
    finishTrench() {
        this.isDrawingTrench = false;
        
        if (this.trenchPoints.length >= 2) {
            // Calculate cost
            let totalLength = 0;
            for (let i = 1; i < this.trenchPoints.length; i++) {
                const dx = this.trenchPoints[i].x - this.trenchPoints[i-1].x;
                const dy = this.trenchPoints[i].y - this.trenchPoints[i-1].y;
                totalLength += Math.sqrt(dx * dx + dy * dy);
            }
            
            const cost = Math.ceil(totalLength / 50) * CONFIG.COST_TRENCH_PER_UNIT;
            
            if (this.game.canAfford(cost)) {
                this.game.spendSupplies(cost);
                this.game.trenchSystem.createTrench(this.trenchPoints, CONFIG.TEAM_PLAYER);
            }
        }
        
        this.trenchPoints = [];
    }
    
    placeBuilding(type) {
        const costs = {
            'machinegun': CONFIG.COST_MACHINEGUN,
            'artillery': CONFIG.COST_ARTILLERY,
            'medical_tent': CONFIG.COST_MEDICAL_TENT,
            'bunker': CONFIG.COST_BUNKER,
            'observation_post': CONFIG.COST_OBSERVATION_POST,
            'supply_depot': CONFIG.COST_SUPPLY_DEPOT,
            'mortar': CONFIG.COST_MORTAR
        };
        
        const cost = costs[type];
        
        // Cap supply depots at 2
        if (type === 'supply_depot') {
            const existingDepots = this.game.buildingManager.buildings.filter(
                b => b.type === 'supply_depot' && b.team === CONFIG.TEAM_PLAYER && !b.destroyed
            ).length;
            if (existingDepots >= 2) return; // Can't build more than 2
        }
        
        if (this.game.canAfford(cost) && 
            this.game.buildingManager.canPlace(type, this.worldX, this.worldY)) {
            this.game.spendSupplies(cost);
            this.game.buildingManager.createBuilding(type, this.worldX, this.worldY, CONFIG.TEAM_PLAYER, true);
        }
    }
    
    startWire() {
        this.isDrawingWire = true;
        this.wirePoints = [{ x: this.worldX, y: this.worldY }];
    }
    
    addWirePoint() {
        if (!this.isDrawingWire) return;
        
        const lastPoint = this.wirePoints[this.wirePoints.length - 1];
        const dist = Math.sqrt(
            (this.worldX - lastPoint.x) ** 2 + 
            (this.worldY - lastPoint.y) ** 2
        );
        
        if (dist >= 30) {
            this.wirePoints.push({ x: this.worldX, y: this.worldY });
        }
    }
    
    finishWire() {
        this.isDrawingWire = false;
        
        if (this.wirePoints.length >= 2) {
            // Calculate cost based on length
            let totalLength = 0;
            for (let i = 1; i < this.wirePoints.length; i++) {
                const dx = this.wirePoints[i].x - this.wirePoints[i-1].x;
                const dy = this.wirePoints[i].y - this.wirePoints[i-1].y;
                totalLength += Math.sqrt(dx * dx + dy * dy);
            }
            
            const cost = Math.ceil(totalLength / 30) * 2; // 2 supplies per 30 units
            
            if (this.game.canAfford(cost)) {
                this.game.spendSupplies(cost);
                this.game.buildingManager.createBarbedWireLine(this.wirePoints, CONFIG.TEAM_PLAYER);
            }
        }
        
        this.wirePoints = [];
    }
    
    update() {
        // Keyboard camera controls
        const panSpeed = 400 * this.game.deltaTime;
        
        if (this.keys['w'] || this.keys['arrowup']) {
            this.renderer.pan(0, -panSpeed);
        }
        if (this.keys['s'] || this.keys['arrowdown']) {
            this.renderer.pan(0, panSpeed);
        }
        if (this.keys['a'] || this.keys['arrowleft']) {
            this.renderer.pan(-panSpeed, 0);
        }
        if (this.keys['d'] || this.keys['arrowright']) {
            this.renderer.pan(panSpeed, 0);
        }
        
        // Edge scrolling disabled - use WASD for camera movement
    }
}

