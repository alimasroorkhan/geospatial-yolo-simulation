# Geospatial YOLO Simulation

A geospatial UAV simulation platform integrating satellite imagery, YOLO-based object detection, and mission planning workflows using a browser-based interface and FastAPI backend.

---

## Features

- Leaflet-based satellite map interface
- UAV movement simulation with keyboard controls
- Adjustable altitude and heading system
- Real-time downward camera view
- Image capture system for saving frames
- FastAPI backend for tile handling and processing
- YOLO-based object detection support
- Mission scanning workflow with grid traversal
- Structured output for logs and analysis

---

## Controls

| Key | Action |
|------|--------|
| W | Move forward |
| S | Move backward |
| A | Strafe left |
| D | Strafe right |
| Q | Rotate left |
| E | Rotate right |
| R | Increase altitude |
| F | Decrease altitude |
| Shift | Boost speed |
| H | Hold mode toggle |
| Space | Capture frame |

---

## Installation

```bash
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
