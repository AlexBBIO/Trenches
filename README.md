# Trenches

A WW1 trench warfare strategy game built with HTML5 Canvas and vanilla JavaScript.

![Game Screenshot](screenshot.png)

## Features

- **Draw trenches** - Click and drag to draw trench lines that your workers will build
- **Build emplacements** - Place machine guns, artillery, and barbed wire
- **Command your troops** - Order soldiers to man positions or charge the enemy
- **Train logistics** - Reinforcements arrive by train to fill your lines
- **Fight the enemy AI** - Defend against enemy attacks and launch your own offensives

## How to Play

1. **Start a local server** (the game uses ES6 modules):
   ```bash
   cd trench-game
   python3 -m http.server 8080
   ```

2. **Open in browser**: http://localhost:8080

3. **Controls**:
   - **Left click + drag** - Draw trenches or place buildings (depending on selected tool)
   - **Right click** - Order selected units to move/attack
   - **WASD / Arrow keys** - Pan camera
   - **Mouse wheel** - Zoom in/out
   - **Toolbar buttons** - Select tools (Select, Trench, Machine Gun, Artillery, Barbed Wire)

## Game Mechanics

### Units
- **Soldiers** - Fight enemies, man trenches and emplacements
- **Workers** - Build trenches, emplacements, and barbed wire

### Buildings
- **Machine Guns** - Rapid fire, requires a soldier to operate
- **Artillery** - Long range explosive shells, requires a soldier to operate
- **Barbed Wire** - Slows and damages enemies passing through

### Combat
- Units in trenches take 50% less damage
- Charging troops will seek out enemy trenches
- Close combat deals high damage

## Tech Stack

- HTML5 Canvas
- Vanilla JavaScript (ES6 modules)
- CSS for UI

## Project Structure

```
trench-game/
├── index.html          # Entry point
├── css/
│   └── style.css       # UI styling
├── js/
│   ├── game.js         # Main game loop, config
│   ├── renderer.js     # Canvas drawing, camera
│   ├── input.js        # Mouse/keyboard handling
│   ├── trench.js       # Trench system
│   ├── units.js        # Soldiers, workers
│   ├── buildings.js    # Emplacements, wire
│   ├── trains.js       # Reinforcement trains
│   ├── combat.js       # Damage, projectiles
│   ├── ai.js           # Enemy AI
│   └── ui.js           # HUD, menus
└── assets/             # (Future: sprites, sounds)
```

## License

MIT

