
<img width="2559" height="1388" alt="Screenshot 2026-08-22 193457" src="https://github.com/user-attachments/assets/203f2a66-6148-4465-9fcb-5aecd6c1551c" />
<img width="2557" height="1389" alt="Screenshot 2026-08-22 193549" src="https://github.com/user-attachments/assets/8360bd2d-e08f-4b8f-85ae-bd18e50f4c35" />
<img width="2558" height="1381" alt="Screenshot 2026-08-22 193626" src="https://github.com/user-attachments/assets/58374289-9baa-491f-9db3-339f7cb0251a" />
<img width="2556" height="1385" alt="Screenshot 2026-08-22 193712" src="https://github.com/user-attachments/assets/399dbdd7-3c8f-4d9f-9ce4-c9768b9fac09" />



---

## 📌 Overview
This update delivers a comprehensive visual, functional, and responsive overhaul across gSender's Probing subsystem and machine controls, engineered through collaborative **AI-assisted pair programming**. 

Key highlights include responsive viewport scaling across 1440p, 1080p, and portrait layouts, mathematical 36px corner anchoring, synchronized arrow animations, new **Coolant status & control labels**, and an intelligent 3-state adaptive **Jog Controls Drawer** that glides out from behind the modal card without cross-screen clipping or glitches.

---

## ✨ Key Changes & Features

### 1. 🎛️ Intelligent 3-State "JOG CONTROLS" Drawer (`ModalJogDrawer`)
* **Adaptive Multi-Orientation Architecture**:
  * **Landscape Mode ($\ge 1100\text{px}$)**: Docks to the **Right edge**; peeks out from behind the modal and glides out horizontally, with the tab button travelling along the outer right edge.
  * **Portrait / Narrow-Tall Mode ($< 1100\text{px}$ & $\ge 750\text{px}$)**: Docks to the **Top edge** (offset 20px right to clear corner radiuses); glides upwards with the tab button travelling along its top edge.
  * **Cramped Mode ($< 1100\text{px}$ & $< 750\text{px}$)**: Automatically hidden (`display: none`) to prevent viewport clipping on small or square screens.
* **Buttery Full-Travel Glide & 1s Delay**: Features a 1-second entrance delay on modal open so the modal card settles before the tab button smoothly glides out from completely behind the border.
* **Zero-Glitch Orientation Switch**: Layout transition listeners dynamically unmount and reset the drawer during active window resizing, completely eliminating diagonal cross-screen jumping.
* **Streamlined Header**: Removed redundant `✕` close buttons, using the travelling tab button as a single, intuitive toggle.

### 2. ❄️ Coolant Label & Status Indicator Additions
* Integrated clearer, updated **Coolant labels and state indicators** in the UI to give operators instant, unambiguous visibility into Flood / Mist coolant states directly from the control dashboard.

### 3. 🎯 Edge & Corner Finder Overhaul (`EdgeCornerFinderModal`)
* **36px Equidistant Corner Anchoring**: Mathematically anchored corner indicator arrows and touch targets with an exact 36px offset across all four quadrants (Top-Left, Top-Right, Bottom-Left, Bottom-Right).
* **Master-Clock Synchronized Animations**: Unified all animated arrows to a single CSS master variable (`--arrow-bounce`), ensuring 100% lockstep rhythmic bounce across all corners.

### 4. 📐 Responsive Probing Layout & Center Alignment
* **Dynamic Viewport Scaling**: Removed rigid max-height caps and overflow constraints in `Probe.tsx`; scaled probe preview graphics with responsive `14vh` constraints in `ProbeImage.tsx` to eliminate unwanted scrollbars.
* **Centered 3D Dropdown & Action Grid**: Centered the 3D probe dropdown selector and unified its width with the 2×2 button grid (`grid-rows-[auto_auto] items-center justify-center`).
* **Modernized Center Finder & Calibration**: Updated UI styling, SVG illustrations, and crosshair visualizers for **Material Center Finder**, **Bore & Boss Center Finder**, and **Stylus Calibration**.

### 5. 🤖 AI-Assisted Engineering
* Architected, debugged, and optimized via collaborative AI pair programming (Google Antigravity), streamlining complex CSS transform matrices, DOM stacking contexts, and cross-platform packaging.

---

## 🛠️ Modified & Added Files
* `src/app/src/features/Probe/ModalJogDrawer.tsx` & `.css` — Adaptive 3-state Jog Drawer & transition logic
* `src/app/src/features/Probe/EdgeCornerFinderModal.tsx` & `.css` — 36px equidistant corner anchoring & synchronized bounce
* `src/app/src/features/Probe/MaterialCenterFinderModal.tsx` & `.css` — Center finder layout modernization
* `src/app/src/features/Probe/BoreCenterFinderModal.tsx` & `.css` — Bore/Boss finder styling & responsiveness
* `src/app/src/features/Probe/ProbeCalibrationModal.tsx` & `.css` — Stylus calibration dialog updates
* `src/app/src/features/Probe/Probe.tsx` — Responsive widget layout & centered 3D selector grid
* `src/app/src/features/Probe/ProbeImage.tsx` — Viewport-aware responsive image scaling

---

## 🧪 Hardware & Display Verification
- [x] 🦾 **Real-World CNC Hardware Testing**: Thoroughly tested and verified by a human operator directly on a physical CNC machine.
- [x] **1440p Monitor**: Verified full-resolution layouts, modal centering, and jog drawer clearance.
- [x] **1080p Monitor**: Verified responsive scaling without scrollbars or clipped action buttons.
- [x] **Portrait / Narrow Window Mode**: Verified automatic top-docking, 20px radius clearance, and smooth upward glide.
- [x] **Live Window Resizing**: Verified zero cross-screen jumping during dynamic orientation transitions.
- [x] **Packaging**: Windows x64 NSIS installer (`gSender-1.6.3-x64.exe`) and unpacked binaries built and validated.

