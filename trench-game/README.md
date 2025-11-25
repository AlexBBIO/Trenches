# Trench Warfare

A WWI-themed real-time strategy game built with vanilla JavaScript and HTML5 Canvas.

## How to Play

### Controls
- **WASD / Arrow Keys**: Pan camera
- **Left Click**: Select units or buildings, place structures
- **Right Click**: Move selected units, order attacks
- **Shift + Click**: Add to selection
- **Escape**: Deselect all, cancel current tool
- **Number Keys 1-0**: Quick select tools

### Tools (Hotkeys)
| Key | Tool | Cost | Description |
|-----|------|------|-------------|
| 1 | Select | - | Select and command units |
| 2 | Trench | - | Draw defensive trench lines |
| 3 | Machine Gun | 25⚙️ | Rapid-fire emplacement, needs manning |
| 4 | Artillery | 50⚙️ | Long-range bombardment, uses shells |
| 5 | Barbed Wire | 10⚙️ | Slows and damages enemy infantry |
| 6 | Medical Tent | 30⚙️ | Heals nearby wounded units |
| 7 | Bunker | 40⚙️ | Protected firing position for 4 soldiers |
| 8 | Observation Post | 20⚙️ | Extends vision range, needs manning |
| 9 | Supply Depot | 35⚙️ | Increases supply regeneration |
| 0 | Mortar Pit | 30⚙️ | Short-range artillery, uses fractional shells |

### Units
- **Soldiers**: Combat units that can man emplacements, enter bunkers, and charge enemies
- **Workers**: Build structures, repair damage, and haul ammunition

### Resources
- **👥 Manpower**: Current unit count
- **⚙️ Supplies**: Used to build structures and order reinforcements
- **💣 Shells**: Ammunition for artillery and mortars

### Tips
- Draw trenches to protect your soldiers from enemy fire
- Wounded soldiers near a Medical Tent will seek healing
- Soldiers automatically fill empty bunkers and man emplacements
- Use the train system to order reinforcements and supplies
- Click on your buildings to see status and access actions

## Running the Game

1. Start a local web server in the `trench-game` directory:
   ```bash
   npx serve -p 8080
   # or
   python -m http.server 8080
   ```

2. Open `http://localhost:8080` in your browser

## Features

- **Fog of War**: Enemy units and buildings hidden until revealed
- **Building Selection**: Click buildings to see health, status, and actions
- **Auto-Manning**: Soldiers automatically staff emplacements and bunkers
- **Medical System**: Wounded units seek nearby medical tents for healing
- **Train Reinforcements**: Order soldiers, workers, and shells via train
- **Day/Night Cycle**: Visual atmosphere changes (coming soon)

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- HTML5 Canvas for rendering
- CSS3 for UI styling
- No external dependencies

## License

MIT License


