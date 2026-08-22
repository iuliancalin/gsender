// 3D Probe Edge & Corner Finder - Plugin Controller (gSender 1.7+)

(function () {
    // State
    const state = {
        probeZ: false,
        probeLeftX: true,
        probeRightX: false,
        probeTopY: false,
        probeBottomY: false,
        tipDia: 2.0,
        fastFeed: 150.0,
        slowFeed: 50.0,
        rapidFeed: 0,
        retractDist: 2.0,
        units: 'mm', // 'mm' or 'in'
        isRunning: false,
        probePinStatus: false,
        hasTriggered: false,
        jogStep: 1.0,
        jogOpen: false
    };

    // DOM Elements
    const elements = {
        stockBlock: document.getElementById('stockBlock'),
        cornerMarker: document.getElementById('cornerMarker'),
        arrowLeft: document.getElementById('arrowLeft'),
        arrowRight: document.getElementById('arrowRight'),
        arrowTop: document.getElementById('arrowTop'),
        arrowBottom: document.getElementById('arrowBottom'),
        btnTopY: document.getElementById('btnTopY'),
        btnBottomY: document.getElementById('btnBottomY'),
        btnLeftX: document.getElementById('btnLeftX'),
        btnRightX: document.getElementById('btnRightX'),
        btnProbeZ: document.getElementById('btnProbeZ'),
        instructionGuide: document.getElementById('instructionGuide'),
        tipBanner: document.getElementById('tipBanner'),
        btnDismissBanner: document.getElementById('btnDismissBanner'),
        inputTipDia: document.getElementById('inputTipDia'),
        inputFastFeed: document.getElementById('inputFastFeed'),
        inputSlowFeed: document.getElementById('inputSlowFeed'),
        inputRapidFeed: document.getElementById('inputRapidFeed'),
        inputRetractDist: document.getElementById('inputRetractDist'),
        btnRun: document.getElementById('btnRun'),
        btnStop: document.getElementById('btnStop'),
        connectivityDot: document.getElementById('connectivityDot'),
        connectivityText: document.getElementById('connectivityText'),
        btnToggleJog: document.getElementById('btnToggleJog'),
        btnCloseJog: document.getElementById('btnCloseJog'),
        jogDrawer: document.getElementById('jogDrawer')
    };

    // Initialize values from local storage
    const dismissed = localStorage.getItem('gsender_probe_dismissed_banner') === 'true';
    if (dismissed && elements.tipBanner) {
        elements.tipBanner.style.display = 'none';
    }

    // Communication Bridge with gSender 1.7 Host
    function sendGcodeToHost(gcode) {
        console.log('[Edge Finder Plugin] Sending G-Code to gSender:\n' + gcode);
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'gcode',
                source: 'edge-corner-finder',
                command: gcode
            }, '*');
            
            // Also attempt standard plugin-sdk bridge message
            window.parent.postMessage({
                type: 'gsender:command',
                payload: { command: 'gcode', gcode: gcode }
            }, '*');
        }
    }

    function jogAxis(axis, direction) {
        const dist = state.jogStep * direction;
        const feed = state.units === 'in' ? 100 : 2500;
        const gcode = `G91 G0 ${axis}${dist} F${feed}\nG90`;
        sendGcodeToHost(gcode);
    }

    function zeroAxis(axis) {
        if (axis === 'ALL') {
            sendGcodeToHost('G10 L20 P0 X0 Y0 Z0');
        } else {
            sendGcodeToHost(`G10 L20 P0 ${axis}0`);
        }
    }

    // Listen for events from gSender parent frame
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data) return;

        // Machine status / pin state updates
        if (data.type === 'status' || data.type === 'machineState' || data.pinState) {
            const probePin = data.pinState?.P ?? data.status?.pinState?.P ?? false;
            state.probePinStatus = !!probePin;
            if (state.probePinStatus) {
                state.hasTriggered = true;
            }
            updateConnectivityDisplay();
        }

        // Units update
        if (data.units === 'in' || data.units === 'mm') {
            state.units = data.units;
            document.querySelectorAll('.unit-len').forEach(el => el.textContent = state.units);
            document.querySelectorAll('.unit-feed').forEach(el => el.textContent = state.units + '/min');
        }
    });

    // Update UI State & Animations
    function updateDiagram() {
        const isTopLeft = state.probeLeftX && state.probeTopY;
        const isTopRight = state.probeRightX && state.probeTopY;
        const isBottomLeft = state.probeLeftX && state.probeBottomY;
        const isBottomRight = state.probeRightX && state.probeBottomY;
        const isCorner = isTopLeft || isTopRight || isBottomLeft || isBottomRight;

        // Stock block active edges
        elements.stockBlock.classList.toggle('edge-left-active', state.probeLeftX);
        elements.stockBlock.classList.toggle('edge-right-active', state.probeRightX);
        elements.stockBlock.classList.toggle('edge-top-active', state.probeTopY);
        elements.stockBlock.classList.toggle('edge-bottom-active', state.probeBottomY);

        // Buttons active states
        elements.btnLeftX.classList.toggle('selected', state.probeLeftX);
        elements.btnRightX.classList.toggle('selected', state.probeRightX);
        elements.btnTopY.classList.toggle('selected', state.probeTopY);
        elements.btnBottomY.classList.toggle('selected', state.probeBottomY);
        elements.btnProbeZ.classList.toggle('selected', state.probeZ);

        elements.btnLeftX.querySelector('.check-box').textContent = state.probeLeftX ? '☑' : '☐';
        elements.btnRightX.querySelector('.check-box').textContent = state.probeRightX ? '☑' : '☐';
        elements.btnTopY.querySelector('.check-box').textContent = state.probeTopY ? '☑' : '☐';
        elements.btnBottomY.querySelector('.check-box').textContent = state.probeBottomY ? '☑' : '☐';
        elements.btnProbeZ.querySelector('.check-box').textContent = state.probeZ ? '☑' : '☐';

        // Corner Marker sliding dot
        elements.cornerMarker.classList.toggle('active', isCorner);
        elements.cornerMarker.classList.toggle('inactive', !isCorner);

        elements.cornerMarker.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right');
        if (isTopLeft) elements.cornerMarker.classList.add('top-left');
        else if (isTopRight) elements.cornerMarker.classList.add('top-right');
        else if (isBottomLeft) elements.cornerMarker.classList.add('bottom-left');
        else if (isBottomRight) elements.cornerMarker.classList.add('bottom-right');

        // Directional Arrows sliding positions
        elements.arrowLeft.classList.toggle('active', state.probeLeftX);
        elements.arrowLeft.classList.toggle('inactive', !state.probeLeftX);
        elements.arrowLeft.classList.toggle('corner-tl', isTopLeft);
        elements.arrowLeft.classList.toggle('corner-bl', isBottomLeft);

        elements.arrowRight.classList.toggle('active', state.probeRightX);
        elements.arrowRight.classList.toggle('inactive', !state.probeRightX);
        elements.arrowRight.classList.toggle('corner-tr', isTopRight);
        elements.arrowRight.classList.toggle('corner-br', isBottomRight);

        elements.arrowTop.classList.toggle('active', state.probeTopY);
        elements.arrowTop.classList.toggle('inactive', !state.probeTopY);
        elements.arrowTop.classList.toggle('corner-tl', isTopLeft);
        elements.arrowTop.classList.toggle('corner-tr', isTopRight);

        elements.arrowBottom.classList.toggle('active', state.probeBottomY);
        elements.arrowBottom.classList.toggle('inactive', !state.probeBottomY);
        elements.arrowBottom.classList.toggle('corner-bl', isBottomLeft);
        elements.arrowBottom.classList.toggle('corner-br', isBottomRight);

        // Update instruction text
        updateInstructionCard(isTopLeft, isTopRight, isBottomLeft, isBottomRight, isCorner);
    }

    function updateInstructionCard(isTopLeft, isTopRight, isBottomLeft, isBottomRight, isCorner) {
        let cornerName = 'Outside Selected Edge';
        if (isTopLeft) cornerName = 'Above / Outside Top-Left Corner (-X, +Y)';
        else if (isTopRight) cornerName = 'Above / Outside Top-Right Corner (+X, +Y)';
        else if (isBottomLeft) cornerName = 'Above / Outside Bottom-Left Corner (-X, -Y)';
        else if (isBottomRight) cornerName = 'Above / Outside Bottom-Right Corner (+X, -Y)';
        else if (state.probeLeftX) cornerName = 'Left of Workpiece (-X)';
        else if (state.probeRightX) cornerName = 'Right of Workpiece (+X)';
        else if (state.probeTopY) cornerName = 'Back of Workpiece (+Y)';
        else if (state.probeBottomY) cornerName = 'Front of Workpiece (-Y)';

        const order = [];
        if (state.probeZ) order.push('<span class="pill">Z Surface</span>');
        if (state.probeLeftX) order.push('<span class="pill">Left (-X)</span>');
        if (state.probeRightX) order.push('<span class="pill">Right (+X)</span>');
        if (state.probeTopY) order.push('<span class="pill">Back (+Y)</span>');
        if (state.probeBottomY) order.push('<span class="pill">Front (-Y)</span>');

        let html = `
            <div class="instruction-step">
                <span class="instruction-label">1. Place Probe:</span>
                <span>${cornerName}</span>
            </div>
            <div class="instruction-step">
                <span class="instruction-label">2. Probing Order:</span>
                <span>${order.join(' ➔ ') || 'Select an edge or corner above'}</span>
            </div>
            <div class="instruction-step">
                <span class="instruction-label">3. Zeroing Result:</span>
                <span>Zeros ${state.probeZ ? 'Z, ' : ''}${state.probeLeftX || state.probeRightX ? 'X ' : ''}${state.probeTopY || state.probeBottomY ? 'Y ' : ''}and applies stylus radius offset (${(state.tipDia / 2).toFixed(2)} mm).</span>
            </div>
        `;
        elements.instructionGuide.innerHTML = html;
    }

    function updateConnectivityDisplay() {
        if (!elements.connectivityDot || !elements.connectivityText) return;
        if (state.probePinStatus) {
            elements.connectivityDot.className = 'connectivity-dot active';
            elements.connectivityText.textContent = '3D Probe: Contact Triggered';
        } else if (state.hasTriggered) {
            elements.connectivityDot.className = 'connectivity-dot verified';
            elements.connectivityText.textContent = '3D Probe: Connectivity Verified ✓';
        } else {
            elements.connectivityDot.className = 'connectivity-dot untested';
            elements.connectivityText.textContent = '3D Probe: Not Tested (Touch tip to test)';
        }
    }

    // Toggle Handlers
    elements.btnLeftX.onclick = () => {
        state.probeLeftX = !state.probeLeftX;
        if (state.probeLeftX) state.probeRightX = false;
        updateDiagram();
    };

    elements.btnRightX.onclick = () => {
        state.probeRightX = !state.probeRightX;
        if (state.probeRightX) state.probeLeftX = false;
        updateDiagram();
    };

    elements.btnTopY.onclick = () => {
        state.probeTopY = !state.probeTopY;
        if (state.probeTopY) state.probeBottomY = false;
        updateDiagram();
    };

    elements.btnBottomY.onclick = () => {
        state.probeBottomY = !state.probeBottomY;
        if (state.probeBottomY) state.probeTopY = false;
        updateDiagram();
    };

    elements.btnProbeZ.onclick = () => {
        state.probeZ = !state.probeZ;
        updateDiagram();
    };

    if (elements.btnDismissBanner) {
        elements.btnDismissBanner.onclick = () => {
            if (elements.tipBanner) elements.tipBanner.style.display = 'none';
            localStorage.setItem('gsender_probe_dismissed_banner', 'true');
        };
    }

    // Input handlers
    elements.inputTipDia.onchange = (e) => state.tipDia = Number(e.target.value) || 2.0;
    elements.inputFastFeed.onchange = (e) => state.fastFeed = Number(e.target.value) || 150;
    elements.inputSlowFeed.onchange = (e) => state.slowFeed = Number(e.target.value) || 50;
    elements.inputRapidFeed.onchange = (e) => state.rapidFeed = Number(e.target.value) || 0;
    elements.inputRetractDist.onchange = (e) => state.retractDist = Number(e.target.value) || 2.0;

    // Jog Drawer
    elements.btnToggleJog.onclick = () => {
        state.jogOpen = !state.jogOpen;
        elements.jogDrawer.classList.toggle('open', state.jogOpen);
    };

    elements.btnCloseJog.onclick = () => {
        state.jogOpen = false;
        elements.jogDrawer.classList.remove('open');
    };

    document.querySelectorAll('.jog-btn[data-axis]').forEach(btn => {
        btn.onclick = () => {
            const axis = btn.getAttribute('data-axis');
            const dir = Number(btn.getAttribute('data-dir'));
            jogAxis(axis, dir);
        };
    });

    document.querySelectorAll('.step-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.step-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.jogStep = Number(btn.getAttribute('data-step'));
        };
    });

    document.getElementById('btnZeroAll').onclick = () => zeroAxis('ALL');
    document.getElementById('btnZeroX').onclick = () => zeroAxis('X');
    document.getElementById('btnZeroY').onclick = () => zeroAxis('Y');
    document.getElementById('btnZeroZ').onclick = () => zeroAxis('Z');

    // Generate G-Code & Run
    elements.btnRun.onclick = () => {
        const radius = (state.tipDia / 2).toFixed(4);
        const searchDist = (state.retractDist * 6).toFixed(2);
        const slowDist = (state.retractDist * 2).toFixed(2);
        const fFast = state.fastFeed;
        const fSlow = state.slowFeed;
        const retract = state.retractDist;

        let g = [];
        g.push('; --- 3D Touch Probe Edge & Corner Sequence ---');
        g.push(state.units === 'in' ? 'G20' : 'G21');
        g.push('G91'); // Incremental mode

        // Z Surface Probing
        if (state.probeZ) {
            g.push('; Step 1: Probe Z Surface');
            g.push(`G38.2 Z-${searchDist} F${fFast}`);
            g.push(`G0 Z${retract}`);
            g.push(`G38.2 Z-${slowDist} F${fSlow}`);
            g.push('G10 L20 P0 Z0');
            g.push(`G0 Z${retract * 2}`);
        }

        // X Edge Probing
        if (state.probeLeftX) {
            g.push('; Probe Left Edge (-X)');
            g.push(`G38.2 X${searchDist} F${fFast}`);
            g.push(`G0 X-${retract}`);
            g.push(`G38.2 X${slowDist} F${fSlow}`);
            g.push(`G10 L20 P0 X-${radius}`);
            g.push(`G0 X-${retract * 2}`);
        } else if (state.probeRightX) {
            g.push('; Probe Right Edge (+X)');
            g.push(`G38.2 X-${searchDist} F${fFast}`);
            g.push(`G0 X${retract}`);
            g.push(`G38.2 X-${slowDist} F${fSlow}`);
            g.push(`G10 L20 P0 X${radius}`);
            g.push(`G0 X${retract * 2}`);
        }

        // Y Edge Probing
        if (state.probeTopY) {
            g.push('; Probe Back Edge (+Y)');
            g.push(`G38.2 Y-${searchDist} F${fFast}`);
            g.push(`G0 Y${retract}`);
            g.push(`G38.2 Y-${slowDist} F${fSlow}`);
            g.push(`G10 L20 P0 Y${radius}`);
            g.push(`G0 Y${retract * 2}`);
        } else if (state.probeBottomY) {
            g.push('; Probe Front Edge (-Y)');
            g.push(`G38.2 Y${searchDist} F${fFast}`);
            g.push(`G0 Y-${retract}`);
            g.push(`G38.2 Y${slowDist} F${fSlow}`);
            g.push(`G10 L20 P0 Y-${radius}`);
            g.push(`G0 Y-${retract * 2}`);
        }

        g.push('G90'); // Absolute mode
        g.push('; --- Probe Complete ---');

        const gcodeString = g.join('\n');
        sendGcodeToHost(gcodeString);

        elements.btnRun.style.display = 'none';
        elements.btnStop.style.display = 'flex';
        state.isRunning = true;
    };

    elements.btnStop.onclick = () => {
        sendGcodeToHost('!\n%wait\n');
        elements.btnStop.style.display = 'none';
        elements.btnRun.style.display = 'flex';
        state.isRunning = false;
    };

    // Initial render
    updateDiagram();
    updateConnectivityDisplay();
})();
