# 3D Touch Probe Edge & Corner Finder - gSender 1.7 Plugin

A standalone UI plugin for **gSender 1.7+ (Edge)** that brings advanced 3D touch probe edge and corner finding into your workflow.

---

## Features
- 🧭 **Comprehensive Edge & Corner Probing:** Find -X, +X, -Y, +Y single edges or Top-Left, Top-Right, Bottom-Left, Bottom-Right corner datum points.
- 📐 **Z Surface Probing:** Optional pre-probing of the top workpiece surface.
- 🧈 **Smooth 60fps Micro-Animations:** Gliding corner target dot, active edge glow highlights, and animated directional probe arrows.
- 🕹️ **Integrated Slide-Out Jog Controls:** Easily position the spindle near the target edge/corner with full XY/Z jog pad, step sizes, and quick zeroing.
- 🛡️ **Live Probe Connectivity Detection:** Visual safety indicator changes from pulsing red (untested) to glowing green when physical contact is verified.
- 📏 **Automatic Stylus Radius Compensation:** Precise mathematical calculation based on your calibrated stylus diameter.

---

## How to Install in gSender 1.7 Edge

1. Launch **gSender 1.7 (Edge)**.
2. Go to the **Tools** or **Plugins** section in the navigation menu.
3. Click **Install Plugin** or **Load Plugin from Folder**.
4. Browse and select this `edge-corner-finder` folder:
   ```
   C:\Users\iulia\Documents\Git GSender\gsender\plugins\edge-corner-finder
   ```
5. Click **Enable / Open**. The plugin will load immediately inside your gSender workspace!

---

## Files Included in this Plugin Package
- `package.json` — Plugin metadata & gSender permissions definition.
- `manifest.json` — Manifest schema descriptor.
- `index.html` — Main UI entry point.
- `styles.css` — Sleek dark theme styling & smooth animations.
- `app.js` — Interactive UI state controller, G-code generator, & gSender communication bridge.
- `icon.svg` — Custom probe tool icon.
- `README.md` — Documentation & quickstart guide.
