# Geospatial YOLO Simulation

A browser-based geospatial UAV simulation platform that integrates satellite imagery, drone-style navigation, YOLO object detection, and mission scanning workflows using a FastAPI backend.

The system allows a simulated UAV to move over satellite imagery, capture downward camera frames, run object detection, and perform grid-based area scans with structured mission reporting.

---

## Features

* Leaflet-based satellite map interface
* UAV movement simulation with keyboard controls
* Adjustable altitude, heading, and camera zoom
* Downward/nadir camera view
* Manual image capture with YOLO inference
* Live detection preview
* Mission Scan mode with grid-based sector traversal
* Sector-wise detection summaries
* Annotated prediction images
* JSON and CSV mission reports
* FastAPI backend for image processing, tile handling, and inference

---

## Detection Classes

The model focuses on three remote-sensing classes:

* `airplane`
* `airport`
* `storage_tank`

The project uses a YOLO OBB model because satellite objects are often rotated and are better represented using oriented bounding boxes instead of standard rectangular boxes.

---

## Tech Stack

### Frontend

* HTML
* CSS
* JavaScript
* Leaflet.js

### Backend

* Python
* FastAPI
* Uvicorn
* PIL
* OpenCV

### Machine Learning

* Ultralytics YOLO
* YOLOv8 OBB
* Custom trained model weights

### Mapping

* Satellite map tiles
* Local tile proxy
* Tile caching
* Image stitching and cropping

---

## Runtime Pipeline

The application does not simply take a browser screenshot. It reconstructs the required UAV camera frame from satellite map tiles and then runs inference.

```text
Drone position and camera metadata
        ↓
Geographic bounds calculation
        ↓
Satellite tile acquisition
        ↓
Tile stitching
        ↓
Region-of-interest cropping
        ↓
Image encoding
        ↓
YOLO OBB inference
        ↓
Polygon annotation
        ↓
Frontend preview and reporting
```

---

## Installation

### 1. Create a virtual environment

```bash
python -m venv .venv
```

### 2. Activate the virtual environment

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

### 3. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If YOLO dependencies are stored separately:

```bash
python -m pip install -r requirements-yolo.txt
```

---

## Model Setup

Place the trained YOLO model inside the `models/` directory.

Expected model path:

```text
models/best.pt
```

or:

```text
models/best1.pt
```

---

## Running the App

Start the FastAPI server:

```bash
python -m uvicorn server.main:app --reload --host 127.0.0.1 --port 2003
```

Open the app in your browser:

```text
http://127.0.0.1:2003/
```

To use another port:

```bash
python -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8010
```

---

## Controls

| Key   | Action            |
| ----- | ----------------- |
| W     | Move forward      |
| S     | Move backward     |
| A     | Strafe left       |
| D     | Strafe right      |
| Q     | Rotate left       |
| E     | Rotate right      |
| R     | Increase altitude |
| F     | Decrease altitude |
| Shift | Boost speed       |
| H     | Toggle hold mode  |
| Space | Capture frame     |

---

## Main Modes

### About

Displays the project overview, model details, validation metrics, and application purpose.

### Controls

Shows keyboard and interface control guidance.

### Capture Mode

Allows manual capture of the current downward camera view and runs YOLO inference on the captured frame.

### Live Preview Mode

Runs repeated detection on the current downward camera view and displays live prediction results.

### Mission Scan

Performs automated grid-based scanning over a selected geographic area.

Mission Scan supports:

* target selection
* scan area presets and custom values
* grid size presets and custom values
* sequential sector scanning
* sector-wise detection results
* annotated image links
* mission summary export
* JSON and CSV reports

---

## Mission Scan Workflow

1. Select a mission target.
2. Select scan area size.
3. Select grid size.
4. Generate the grid.
5. Review the sector layout on the map.
6. Start the scan.
7. The system scans each sector one by one.
8. YOLO inference runs on every sector.
9. Sector results update live in the table.
10. Mission reports can be exported.

Example lawn-mower scan order for a 4 x 4 grid:

```text
A1 -> A2 -> A3 -> A4
B4 -> B3 -> B2 -> B1
C1 -> C2 -> C3 -> C4
D4 -> D3 -> D2 -> D1
```

---

## Mission Output

Mission results are saved inside:

```text
captures/missions/
```

Typical output structure:

```text
captures/missions/mission_YYYYMMDD_HHMMSS/
│
├── raw/
│   └── sector_A1.jpg
│
├── predictions/
│   └── sector_A1_pred.jpg
│
├── metadata/
│   └── sector_A1.json
│
├── mission_summary.json
└── mission_summary.csv
```

Each sector result can include:

* sector ID
* location and bounds
* detection count
* class counts
* average confidence
* raw image path
* annotated prediction image path
* list of detections

---

## Model Performance

Validation results for the deployed YOLO OBB model:

| Class        | Precision | Recall | mAP50 | mAP50-95 |
| ------------ | --------: | -----: | ----: | -------: |
| All classes  |     87.0% |  87.1% | 90.3% |    68.3% |
| Airplane     |     97.5% |  96.8% | 98.2% |    87.7% |
| Airport      |     71.5% |  70.9% | 76.5% |    38.1% |
| Storage Tank |     92.2% |  93.6% | 96.2% |    79.3% |

The model performs strongest on aircraft and storage tanks. Airport detection is more challenging because airports are larger, more complex regions and had fewer labelled examples in the filtered dataset.

---

## Data Science Workflow

The project follows an end-to-end applied computer vision workflow:

* dataset acquisition
* annotation format inspection
* class filtering
* label remapping
* exploratory data analysis
* YOLO OBB training
* validation using detection metrics
* model deployment
* runtime image preprocessing
* inference and reporting through a web interface

---

## Practical Applications

This project is a simulation and research prototype for:

* remote-sensing object detection
* UAV operator training environments
* airfield monitoring simulation
* infrastructure inspection workflows
* geospatial intelligence prototyping
* AI-assisted satellite image interpretation

The system is designed for monitoring, inspection, and simulation. It is not a weapons or targeting system.

---

## Important Notes

* Satellite tile quality affects detection quality.
* Small objects are harder to detect at low zoom levels.
* Mission Scan is more effective than one large capture for large areas.
* Live detection prioritises speed.
* Capture and Mission Scan prioritise higher-quality inference.
* YOLO OBB inference must use `result.obb`, not `result.boxes`.

---

## Troubleshooting

### PowerShell blocks activation

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### Port already in use

Run the server on another port:

```bash
python -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8010
```

### Model not detected

Check that the model file exists:

```text
models/best.pt
```

### Browser shows old interface

Hard refresh the browser:

```text
Ctrl + Shift + R
```

---

## Future Improvements

* detection heatmap layer
* mission replay system
* richer mission report export
* confidence threshold controls
* improved tile-quality management
* additional trained model support
* offline tile support
* advanced runtime analytics dashboard

---

## Summary

Geospatial YOLO Simulation demonstrates how a trained remote-sensing object detection model can be deployed into an interactive geospatial workflow.

It combines UAV-style simulation, satellite image processing, YOLO OBB inference, and mission-level reporting into a single browser-based system.
