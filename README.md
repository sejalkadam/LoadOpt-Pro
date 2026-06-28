# LoadOpt Pro — Load Optimisation System

A professional, real-life 3D load optimisation tool for Indian commercial vehicles.
Built with Flask + Three.js. Inspired by SeaRates Load Calculator.

---

## Features
- **3D visualisation** with rotation, wireframe, explode, and step-by-step placement animation
- **8 default containers** (BS4/BS6 fleet) + custom containers
- **Gravity simulation** — boxes fall to lowest stable position, 50%+ base support required
- **All 6 rotations** configurable globally and per box type
- **Weight + volume checks** per container
- **Multi-container optimisation** — minimum containers, heaviest/largest packed first
- **Export** to Excel (.xlsx) and PDF with full placement table
- **Colour-coded** box legend and stats sidebar

---

## Setup

### 1. Install Python dependencies
```bash
cd load-optimizer
pip install -r requirements.txt
```

### 2. Run the server
```bash
python app.py
```

### 3. Open in browser
```
http://localhost:3000
```

---

## Project Structure
```
load-optimizer/
├── app.py                  # Flask app
├── requirements.txt
├── api/
│   ├── optimizer.py        # Packing engine (gravity, rotations, multi-container)
│   └── exporter.py         # Excel + PDF export
├── templates/
│   └── index.html          # Main UI
└── static/
    ├── css/main.css         # Styles (light, formal, GAVL)
    └── js/
        ├── constants.js     # Fleet + rotation defs
        ├── ui.js            # Input UI state
        ├── viewer3d.js      # Three.js 3D viewer
        └── main.js          # Orchestration + API calls
```

---

## How It Works

### Optimisation Algorithm
1. **Expand** all items by quantity, sort heaviest+largest first
2. **Greedy 3D bin-packing**: For each box, try all allowed rotations in all available spaces
3. **Gravity simulation**: Each box drops to its lowest stable Z-position (≥50% base support)
4. **Guillotine space splitting**: Remaining spaces tracked as non-overlapping 3D cuboids
5. **Multi-container**: Repeat until all boxes are placed, always picking the container that fits the most remaining boxes

### Rotation Codes
| Code | X-axis | Y-axis | Z-axis |
|------|--------|--------|--------|
| LWH  | L      | W      | H      | ← Original (upright)
| LHW  | L      | H      | W      |
| WLH  | W      | L      | H      |
| WHL  | W      | H      | L      |
| HLW  | H      | L      | W      |
| HWL  | H      | W      | L      |

---

## Notes
- Dimensions in **mm**, weight in **kg**
- Weight per box = gross weight per unit
- No CoG / axle weight computation (by design)
- For large shipments (100+ boxes), animation auto-speeds up
