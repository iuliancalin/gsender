import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import controller from 'app/lib/controller';
import store from 'app/store';
import { useWorkspaceState } from 'app/hooks/useWorkspaceState';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import { IMPERIAL_UNITS } from 'app/constants';
import { in2mm, mm2in } from 'app/lib/units';
import pubsub from 'pubsub-js';
import { ModalJogDrawer } from './ModalJogDrawer';
import './BoreCenterFinderModal.css';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRunGcode: (gcode: string) => void;
    connectivityTest?: boolean;
}

interface SettingInputProps {
    label: string;
    value: number | '';
    setter: (v: number | '') => void;
    unit: string;
    step?: string;
    placeholder?: string;
    disabled?: boolean;
    title?: string;
}

const SettingInput = React.memo(
    ({
        label,
        value,
        setter,
        unit,
        step = '1',
        placeholder = '—',
        disabled,
        title,
    }: SettingInputProps) => (
        <div className="bore-center-finder-input-field" title={title}>
            <label className="bore-center-finder-input-label">{label}</label>
            <div className={`bore-center-finder-input-wrapper ${disabled ? 'disabled' : ''}`}>
                <input
                    type="number"
                    step={step}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => {
                        const val = e.target.value;
                        setter(val === '' ? '' : Number(val));
                    }}
                    className="bore-center-finder-input"
                    disabled={disabled}
                    title={title}
                />
                <span className="bore-center-finder-input-unit">{unit}</span>
            </div>
        </div>
    ),
);

const BoreCenterFinderModal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    onRunGcode,
    connectivityTest = false,
}) => {
    const { probePinStatus, activeState } = useTypedSelector((state) => ({
        probePinStatus: state.controller.state.status?.pinState.P ?? false,
        activeState: state.controller.state.status?.activeState ?? 'Idle',
    }));
    const isAlarm = activeState === 'Alarm' || activeState === 'Hold';
    const [hasTriggered, setHasTriggered] = useState<boolean>(false);

    useEffect(() => {
        if (probePinStatus) {
            setHasTriggered(true);
        }
    }, [probePinStatus]);

    const { units } = useWorkspaceState();
    const isImperial = units === IMPERIAL_UNITS;

    const lengthUnit = isImperial ? 'in' : 'mm';
    const feedUnit = isImperial ? 'in/min' : 'mm/min';

    const getStoredTipDia = () => {
        const storedMetric = Number(store.get('widgets.probe.tipDiameter3D', store.get('workspace.probeTipDiameter', 2.0))) || 2.0;
        return isImperial ? Number(mm2in(storedMetric).toFixed(3)) : storedMetric;
    };

    const getStoredFastFeed = () => {
        const storedMetric = Number(store.get('widgets.probe.probeFastFeedrate', 150.0)) || 150.0;
        return isImperial ? Number(mm2in(storedMetric).toFixed(1)) : storedMetric;
    };

    const getStoredSlowFeed = () => {
        const storedMetric = Number(store.get('widgets.probe.probeFeedrate', 75.0)) || 75.0;
        return isImperial ? Number(mm2in(storedMetric).toFixed(1)) : storedMetric;
    };

    const getStoredRetractDist = () => {
        const storedMetric = Number(store.get('widgets.probe.retractionDistance', 2.0)) || 2.0;
        return isImperial ? Number(mm2in(storedMetric).toFixed(3)) : storedMetric;
    };

    const [probeMode, setProbeMode] = useState<'bore' | 'boss'>('bore');
    const [tipDia, setTipDia] = useState<number | ''>(getStoredTipDia);
    const [featureDia, setFeatureDia] = useState<number | ''>('');
    const [fastFeed, setFastFeed] = useState<number | ''>(getStoredFastFeed);
    const [slowFeed, setSlowFeed] = useState<number | ''>(getStoredSlowFeed);
    const [retractDist, setRetractDist] = useState<number | ''>(getStoredRetractDist);
    const [enableZLift, setEnableZLift] = useState<boolean>(true);
    const [zLiftHeight, setZLiftHeight] = useState<number | ''>(isImperial ? 0.6 : 15.0);

    const handleFastFeedChange = (val: number | '') => {
        setFastFeed(val);
        if (typeof val === 'number' && !isNaN(val) && val > 0) {
            const metricVal = isImperial ? Number(in2mm(val).toFixed(1)) : val;
            store.set('widgets.probe.probeFastFeedrate', metricVal);
            pubsub.publish('repopulate');
        }
    };

    const handleSlowFeedChange = (val: number | '') => {
        setSlowFeed(val);
        if (typeof val === 'number' && !isNaN(val) && val > 0) {
            const metricVal = isImperial ? Number(in2mm(val).toFixed(1)) : val;
            store.set('widgets.probe.probeFeedrate', metricVal);
            pubsub.publish('repopulate');
        }
    };

    const handleRetractDistChange = (val: number | '') => {
        setRetractDist(val);
        if (typeof val === 'number' && !isNaN(val) && val > 0) {
            const metricVal = isImperial ? Number(in2mm(val).toFixed(3)) : val;
            store.set('widgets.probe.retractionDistance', metricVal);
            pubsub.publish('repopulate');
        }
    };

    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [dialogState, setDialogState] = useState<'idle' | 'success' | 'failed'>('idle');

    useEffect(() => {
        setFastFeed(getStoredFastFeed());
        setSlowFeed(getStoredSlowFeed());
        setRetractDist(getStoredRetractDist());
        setZLiftHeight(isImperial ? 0.6 : 15.0);
        setTipDia(getStoredTipDia());
        setHasTriggered(false);
    }, [isImperial, isOpen]);

    const isRunningRef = useRef<boolean>(false);
    const cancelRequestedRef = useRef<boolean>(false);
    const hasCompletedRef = useRef<boolean>(false);
    const runStartTimeRef = useRef<number>(0);

    const triggerSuccess = () => {
        if (!isRunningRef.current || cancelRequestedRef.current || hasCompletedRef.current) {
            return;
        }
        hasCompletedRef.current = true;
        isRunningRef.current = false;
        setIsRunning(false);
        setDialogState('success');
    };

    // Serial, message & workflow event listener
    useEffect(() => {
        const handleSerialData = (data: any) => {
            let rawLine = '';
            if (typeof data === 'string') {
                rawLine = data;
            } else if (data && typeof data === 'object') {
                rawLine = data.line || data.data || data.message || JSON.stringify(data);
            }

            if (rawLine && rawLine.includes('BORE_CENTER_DONE')) {
                triggerSuccess();
            }
        };

        const handleWorkflowState = (state: string) => {
            if (state === 'idle' && isRunningRef.current && !cancelRequestedRef.current && !hasCompletedRef.current) {
                if (Date.now() - runStartTimeRef.current > 2000) {
                    triggerSuccess();
                }
            }
        };

        if (controller) {
            if (typeof controller.on === 'function') {
                controller.on('serialport:read', handleSerialData);
                controller.on('feeder:status', handleSerialData);
                controller.on('message', handleSerialData);
                controller.on('workflow:state', handleWorkflowState);
            }
        }

        return () => {
            if (controller) {
                if (typeof controller.off === 'function') {
                    controller.off('serialport:read', handleSerialData);
                    controller.off('feeder:status', handleSerialData);
                    controller.off('message', handleSerialData);
                    controller.off('workflow:state', handleWorkflowState);
                } else if (typeof (controller as any).removeListener === 'function') {
                    (controller as any).removeListener('serialport:read', handleSerialData);
                    (controller as any).removeListener('feeder:status', handleSerialData);
                    (controller as any).removeListener('message', handleSerialData);
                    (controller as any).removeListener('workflow:state', handleWorkflowState);
                }
            }
        };
    }, []);

    // Robust polling safety check to catch completion when serial/feeder events are filtered
    useEffect(() => {
        if (!isRunning) {
            runStartTimeRef.current = 0;
            return;
        }

        if (!runStartTimeRef.current) {
            runStartTimeRef.current = Date.now();
        }

        let idleCounter = 0;

        const intervalId = setInterval(() => {
            if (Date.now() - runStartTimeRef.current < 2000) {
                return;
            }

            const feeder = (controller as any)?.feeder;
            const state = (controller as any)?.state || (controller as any)?.portStatus;

            const feederQueue = feeder?.queue ?? feeder?.pending ?? 0;
            const activeState = (
                state?.status?.activeState ||
                state?.state ||
                ''
            ).toLowerCase();

            if (feederQueue === 0 && activeState === 'idle') {
                idleCounter++;
                if (idleCounter >= 5) {
                    clearInterval(intervalId);
                    triggerSuccess();
                }
            } else {
                idleCounter = 0;
            }
        }, 300);

        return () => {
            clearInterval(intervalId);
        };
    }, [isRunning]);

    // Immediate alarm abort handler
    useEffect(() => {
        if (isAlarm && isRunningRef.current) {
            cancelRequestedRef.current = true;
            isRunningRef.current = false;
            setIsRunning(false);
            setDialogState('failed');
        }
    }, [isAlarm]);

    // Reset internal state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            cancelRequestedRef.current = false;
            hasCompletedRef.current = false;
            runStartTimeRef.current = 0;
            setDialogState('idle');
            setIsRunning(false);
            setHasTriggered(false);
        }
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    const isFormValid =
        typeof featureDia === 'number' &&
        !isNaN(featureDia) &&
        featureDia > 0;

    const handleRun = () => {
        if (!isFormValid) {
            return;
        }

        cancelRequestedRef.current = false;
        hasCompletedRef.current = false;
        isRunningRef.current = true;
        runStartTimeRef.current = Date.now();
        setIsRunning(true);
        setDialogState('idle');

        const effectiveDia = isImperial ? in2mm(Number(featureDia)) : Number(featureDia);
        const effectiveFastFeed = isImperial ? in2mm(Number(fastFeed)) : Number(fastFeed);
        const effectiveSlowFeed = isImperial ? in2mm(Number(slowFeed)) : Number(slowFeed);
        const effectiveRetract = isImperial ? in2mm(Number(retractDist)) : Number(retractDist);
        const effectiveZLift = isImperial ? in2mm(Number(zLiftHeight) || 0.6) : (Number(zLiftHeight) || 15.0);
        const effectiveRapidFeed = Number(store.get('widgets.probe.probeMovementSpeed', 0)) || 0;

        const hasCustomRapid = !isNaN(effectiveRapidFeed) && effectiveRapidFeed > 0;
        const rapidCmd = (coords: string) => (hasCustomRapid ? `G1 ${coords} F[RAPID_FEED]` : `G0 ${coords}`);
        const isLargeFeature = effectiveDia >= 50.0;
        const traverseCmd = (coords: string) => (hasCustomRapid ? `G1 ${coords} F[RAPID_FEED]` : (isLargeFeature ? `G0 ${coords}` : `G1 ${coords} F800`));

        let macroScript = '';
        if (probeMode === 'bore') {
            macroScript = `
; =========================================
; BORE / HOLE CENTER FINDER MACRO
; =========================================
%wait

%BORE_DIA = ${Number(effectiveDia.toFixed(3))}
%PROBE_FEED_FAST = ${Number(effectiveFastFeed.toFixed(1))}
%PROBE_FEED_SLOW = ${Number(effectiveSlowFeed.toFixed(1))}
${hasCustomRapid ? `%RAPID_FEED = ${Number(effectiveRapidFeed.toFixed(1))}\n` : ''}%PROBE_RETRACT = ${Number(effectiveRetract.toFixed(3))}
%SEARCH_DIST = BORE_DIA/2 + 5

%UNITS=modal.units
%DISTANCE=modal.distance

G91
G21

; --- 1. PROBE +X INSIDE RIGHT WALL ---
G38.2 X[SEARCH_DIST] F[PROBE_FEED_FAST]
${rapidCmd('X-[PROBE_RETRACT]')}
G4 P0.3
G38.2 X5 F[PROBE_FEED_SLOW]
%X_RIGHT = posx
${rapidCmd('X-[PROBE_RETRACT]')}
G4 P0.3

; --- 2. PROBE -X INSIDE LEFT WALL ---
G38.2 X-[SEARCH_DIST + PROBE_RETRACT] F[PROBE_FEED_FAST]
${rapidCmd('X[PROBE_RETRACT]')}
G4 P0.3
G38.2 X-5 F[PROBE_FEED_SLOW]
%X_LEFT = posx
${rapidCmd('X[PROBE_RETRACT]')}
G4 P0.3

; --- 3. MOVE DIRECTLY TO TRUE X CENTER & ZERO X ---
%X_CHORD = X_RIGHT - X_LEFT
${rapidCmd('X[ X_CHORD/2 - PROBE_RETRACT ]')}
G4 P0.5
G10 L20 P0 X0

; --- 4. PROBE +Y INSIDE TOP WALL (FROM TRUE X CENTER) ---
G38.2 Y[SEARCH_DIST] F[PROBE_FEED_FAST]
${rapidCmd('Y-[PROBE_RETRACT]')}
G4 P0.3
G38.2 Y5 F[PROBE_FEED_SLOW]
%Y_TOP = posy
${rapidCmd('Y-[PROBE_RETRACT]')}
G4 P0.3

; --- 5. PROBE -Y INSIDE BOTTOM WALL ---
G38.2 Y-[SEARCH_DIST + PROBE_RETRACT] F[PROBE_FEED_FAST]
${rapidCmd('Y[PROBE_RETRACT]')}
G4 P0.3
G38.2 Y-5 F[PROBE_FEED_SLOW]
%Y_BTM = posy
${rapidCmd('Y[PROBE_RETRACT]')}
G4 P0.3

; --- 6. MOVE DIRECTLY TO TRUE Y CENTER & ZERO Y ---
%Y_CHORD = Y_TOP - Y_BTM
${rapidCmd('Y[ Y_CHORD/2 - PROBE_RETRACT ]')}
G4 P0.5
G10 L20 P0 Y0

; --- 7. HOVER AT ABSOLUTE CENTER (X0 Y0) ---
G90
${rapidCmd('X0 Y0')}

(MSG, BORE_CENTER_DONE)

[UNITS] [DISTANCE]
`;
        } else {
            macroScript = `
; =========================================
; BOSS / CYLINDER CENTER FINDER MACRO
; =========================================
%wait

%BOSS_DIA = ${Number(effectiveDia.toFixed(3))}
%PROBE_FEED_FAST = ${Number(effectiveFastFeed.toFixed(1))}
%PROBE_FEED_SLOW = ${Number(effectiveSlowFeed.toFixed(1))}
${hasCustomRapid ? `%RAPID_FEED = ${Number(effectiveRapidFeed.toFixed(1))}\n` : ''}%PROBE_RETRACT = ${Number(effectiveRetract.toFixed(3))}
%Z_LIFT = ${Number(effectiveZLift.toFixed(3))}
%MARGIN = 5
%CLEARANCE = 8

%UNITS=modal.units
%DISTANCE=modal.distance

G91
G21

; --- RECORD START POINT (FRONT -Y IN OPEN AIR) ---
%X_START = posx
%Y_START = posy

; --- 1. PROBE FRONT (-Y) FACE ---
G38.2 Y[ BOSS_DIA/2 + MARGIN ] F[PROBE_FEED_FAST]
${rapidCmd('Y-[PROBE_RETRACT]')}
G4 P0.3
G38.2 Y5 F[PROBE_FEED_SLOW]
%Y_FRONT = posy
${rapidCmd('Y-[PROBE_RETRACT]')}
G4 P0.3
${traverseCmd('Y-[ posy - Y_START ]')}
G4 P0.3

; --- 2. TRAVEL AROUND TO RIGHT (+X) SIDE ---
${traverseCmd('X[ BOSS_DIA/2 + CLEARANCE ]')}
${traverseCmd('Y[ (Y_FRONT - Y_START) + BOSS_DIA/2 ]')}
G4 P0.3
G38.2 X-[ BOSS_DIA/2 + MARGIN + CLEARANCE ] F[PROBE_FEED_FAST]
${rapidCmd('X[PROBE_RETRACT]')}
G4 P0.3
G38.2 X-5 F[PROBE_FEED_SLOW]
%X_RIGHT = posx
${rapidCmd('X[PROBE_RETRACT]')}
G4 P0.3

; --- 3. TRAVEL AROUND TO BACK (+Y) SIDE ---
${traverseCmd('Y[ BOSS_DIA/2 + CLEARANCE ]')}
${traverseCmd('X-[ posx - X_START ]')}
G4 P0.3
G38.2 Y-[ BOSS_DIA/2 + MARGIN + CLEARANCE ] F[PROBE_FEED_FAST]
${rapidCmd('Y[PROBE_RETRACT]')}
G4 P0.3
G38.2 Y-5 F[PROBE_FEED_SLOW]
%Y_BACK = posy
${rapidCmd('Y[PROBE_RETRACT]')}
G4 P0.3

; --- 4. ALIGN WITH TRUE Y CENTER & TRAVEL TO LEFT (-X) SIDE ---
%Y_TRUE_CENTER = (Y_FRONT + Y_BACK)/2
${traverseCmd('Y-[ posy - Y_TRUE_CENTER ]')}
${traverseCmd('X-[ (posx - X_START) + BOSS_DIA/2 + CLEARANCE ]')}
G4 P0.3
G38.2 X[ BOSS_DIA/2 + MARGIN + CLEARANCE ] F[PROBE_FEED_FAST]
${rapidCmd('X-[PROBE_RETRACT]')}
G4 P0.3
G38.2 X5 F[PROBE_FEED_SLOW]
%X_LEFT = posx
${rapidCmd('X-[PROBE_RETRACT]')}
G4 P0.3

; --- 5. COMPUTE TRUE X CENTER & SET WORK OFFSET ---
%X_TRUE_CENTER = (X_RIGHT + X_LEFT)/2
G4 P0.5
G10 L20 P0 X[ posx - X_TRUE_CENTER ] Y[ posy - Y_TRUE_CENTER ]

${enableZLift ? `
; --- 6. SAFE Z LIFT AND HOVER AT CENTER ---
G90
${rapidCmd('Z[Z_LIFT]')}
${rapidCmd('X0 Y0')}
` : ''}

(MSG, BORE_CENTER_DONE)

[UNITS] [DISTANCE]
`;
        }

        onRunGcode(macroScript);
    };

    const handleCancel = () => {
        cancelRequestedRef.current = true;
        isRunningRef.current = false;
        setIsRunning(false);
        setDialogState('failed');
        if (controller && typeof controller.command === 'function') {
            controller.command('reset');
        }
    };

    const handleCompletionAcknowledge = () => {
        setDialogState('idle');
        onClose();
    };

    return ReactDOM.createPortal(
        <>
            <div className="bore-center-finder-overlay">
                <div className="bore-center-finder-modal-wrapper">
                    <ModalJogDrawer disabled={isRunning} />
                    <div className="bore-center-finder-modal">
                    <div className="bore-center-finder-header">
                        <div className="bore-center-finder-title">
                            <span className="bore-center-finder-title-icon">
                                {probeMode === 'bore' ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="9"></circle>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="9" strokeDasharray="3 3"></circle>
                                        <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.2"></circle>
                                    </svg>
                                )}
                            </span>
                            {probeMode === 'bore' ? 'Bore Center Finder (Inside Hole)' : 'Boss Center Finder (Outside Cylinder)'}
                        </div>

                        <div className="bore-center-header-actions">
                            <div className={`bore-center-mode-toggle mode-${probeMode}`}>
                                <div className="bore-center-mode-slider" />
                                <button
                                    type="button"
                                    onClick={() => !isRunning && setProbeMode('bore')}
                                    className={`bore-center-mode-btn ${probeMode === 'bore' ? 'active' : ''}`}
                                    disabled={isRunning}
                                    title="Probe inside of circular hole or pocket"
                                >
                                    <span>⚪</span>
                                    <span>Bore (Inside)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => !isRunning && setProbeMode('boss')}
                                    className={`bore-center-mode-btn ${probeMode === 'boss' ? 'active' : ''}`}
                                    disabled={isRunning}
                                    title="Probe outside of circular post or cylinder"
                                >
                                    <span>🔘</span>
                                    <span>Boss (Outside)</span>
                                </button>
                            </div>

                            <button
                                onClick={onClose}
                                className="bore-center-finder-close-btn"
                                disabled={isRunning}
                                title={isRunning ? 'Cannot close while probing is running' : 'Close'}
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    <div className="bore-center-finder-subtitle">
                        {probeMode === 'bore'
                            ? 'Center probe roughly inside the hole and enter estimated diameter. Probes outward to find true center and zero X and Y.'
                            : 'Position probe in open air in front of cylinder (-Y) at probing depth. Probes around cylinder to find true center and zero X and Y.'}
                    </div>

                    <div className="bore-center-finder-body">
                        <div className={`bore-center-finder-diagram mode-${probeMode}`}>
                            <div className="bore-center-finder-diagram-line-h" />
                            <div className="bore-center-finder-diagram-line-v" />

                            {/* BORE DIAGRAM LAYER (Fades smoothly) */}
                            <div className={`bore-center-diagram-layer bore-layer ${probeMode === 'bore' ? 'active' : 'inactive'}`}>
                                <div className="bore-center-finder-bore-outer bore-mode" />
                                <div className="bore-center-finder-target-ring" />
                                <div className="bore-center-finder-target-center" />

                                <div className="bore-center-finder-arrow-label top outward">
                                    <div className="bore-center-finder-arrow-dot" />
                                    <span className="bore-center-finder-arrow-text">+Y Wall ↑</span>
                                </div>

                                <div className="bore-center-finder-arrow-label bottom outward">
                                    <div className="bore-center-finder-arrow-dot" />
                                    <span className="bore-center-finder-arrow-text">-Y Wall ↓</span>
                                </div>

                                <div className="bore-center-finder-arrow-label left outward">
                                    <span className="bore-center-finder-arrow-text">← -X Wall</span>
                                    <div className="bore-center-finder-arrow-dot" />
                                </div>

                                <div className="bore-center-finder-arrow-label right outward">
                                    <div className="bore-center-finder-arrow-dot" />
                                    <span className="bore-center-finder-arrow-text">+X Wall →</span>
                                </div>
                            </div>

                            {/* BOSS DIAGRAM LAYER (Fades smoothly) */}
                            <div className={`bore-center-diagram-layer boss-layer ${probeMode === 'boss' ? 'active' : 'inactive'}`}>
                                <div className="bore-center-finder-boss-cylinder" />
                                <div className="bore-center-finder-boss-start-point" title="Start probe in open air here (-Y front)">
                                    <span className="bore-center-finder-boss-start-dot" />
                                    <span className="bore-center-finder-boss-start-text">Start (-Y)</span>
                                </div>

                                <div className="bore-center-finder-arrow-label top inward">
                                    <div className="bore-center-finder-arrow-dot" />
                                    <span className="bore-center-finder-arrow-text">3. +Y Back ↓</span>
                                </div>

                                <div className="bore-center-finder-arrow-label bottom inward">
                                    <div className="bore-center-finder-arrow-dot" />
                                    <span className="bore-center-finder-arrow-text">1. -Y Front ↑</span>
                                </div>

                                <div className="bore-center-finder-arrow-label left inward">
                                    <span className="bore-center-finder-arrow-text">4. -X Left →</span>
                                    <div className="bore-center-finder-arrow-dot" />
                                </div>

                                <div className="bore-center-finder-arrow-label right inward">
                                    <div className="bore-center-finder-arrow-dot" />
                                    <span className="bore-center-finder-arrow-text">2. +X Right ←</span>
                                </div>
                            </div>

                            {/* BOSS Z-LIFT BOTTOM BAR (Inside diagram panel at bottom) */}
                            {probeMode === 'boss' && (
                                <div className="bore-center-boss-zlift-bar">
                                    <div className="bore-center-boss-zlift-main-row">
                                        <label className="bore-center-finder-checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={enableZLift}
                                                onChange={(e) => setEnableZLift(e.target.checked)}
                                                disabled={isRunning}
                                            />
                                            <span>Lift Z on finish</span>
                                        </label>
                                        {enableZLift && (
                                            <div className="bore-center-boss-zlift-input-group">
                                                <span className="bore-center-boss-zlift-label">Height:</span>
                                                <input
                                                    type="number"
                                                    value={zLiftHeight}
                                                    onChange={(e) => setZLiftHeight(e.target.value)}
                                                    disabled={isRunning}
                                                    step={isImperial ? "0.05" : "1"}
                                                    className="bore-center-boss-zlift-input"
                                                />
                                                <span className="bore-center-boss-zlift-unit">{lengthUnit}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`bore-center-boss-zlift-note ${enableZLift ? 'active' : 'inactive'}`}>
                                        <span className="bore-center-boss-zlift-note-icon">{enableZLift ? '✓' : 'ℹ️'}</span>
                                        <span>
                                            {enableZLift
                                                ? 'Probe will lift safely above cylinder and rapid to X0 Y0.'
                                                : 'Machine will zero X/Y and stay at last edge at current Z depth.'}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bore-center-finder-form-panel">
                            <div className="bore-center-finder-form-group">
                                <div className="bore-center-finder-form-group-label">3D Probe Stylus</div>
                                <SettingInput
                                    label="Probe Tip Diameter"
                                    value={tipDia}
                                    setter={() => {}}
                                    unit={lengthUnit}
                                    step={isImperial ? '0.005' : '0.01'}
                                    disabled={true}
                                    title="Calibrated stylus diameter is configured in Probe Settings or Stylus Calibration"
                                />
                                <div className="bore-center-finder-setting-note">
                                    <span>🔒</span>
                                    <span>Tip diameter is locked. Change in <strong>Probe Settings</strong> or <strong>Stylus Calibration</strong>.</span>
                                </div>
                            </div>

                            <div className="bore-center-finder-form-group">
                                <div className="bore-center-finder-form-group-label">
                                    {probeMode === 'bore' ? 'Bore Dimensions' : 'Boss Dimensions'}
                                </div>
                                <SettingInput
                                    label={probeMode === 'bore' ? 'Estimated Bore Diameter' : 'Estimated Boss Diameter'}
                                    value={featureDia}
                                    setter={setFeatureDia}
                                    unit={lengthUnit}
                                    step={isImperial ? "0.05" : "1"}
                                    disabled={isRunning}
                                />
                            </div>

                            <div className="bore-center-finder-form-group">
                                <div className="bore-center-finder-form-group-label">Probe Feedrates</div>
                                <SettingInput
                                    label="Fast Feed"
                                    value={fastFeed}
                                    setter={handleFastFeedChange}
                                    unit={feedUnit}
                                    step={isImperial ? "0.5" : "10"}
                                    disabled={isRunning}
                                />
                                <SettingInput
                                    label="Slow Feed"
                                    value={slowFeed}
                                    setter={handleSlowFeedChange}
                                    unit={feedUnit}
                                    step={isImperial ? "0.1" : "1"}
                                    disabled={isRunning}
                                />
                            </div>

                            <div className="bore-center-finder-form-group">
                                <div className="bore-center-finder-form-group-label">Probe Behavior</div>
                                <SettingInput
                                    label="Retract Distance"
                                    value={retractDist}
                                    setter={handleRetractDistChange}
                                    unit={lengthUnit}
                                    step={isImperial ? "0.01" : "0.1"}
                                    disabled={isRunning}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bore-center-finder-footer">
                        <div className="bore-center-finder-footer-left">
                            {isRunning ? (
                                <div className="bore-center-finder-running-status">
                                    <div className="bore-center-finder-running-dot" />
                                    {probeMode === 'bore' ? 'Probing Bore Hole...' : 'Probing Boss Cylinder...'}
                                </div>
                            ) : (
                                connectivityTest && (
                                    <div className="bore-center-finder-connectivity-status">
                                        <div
                                            className={`bore-center-finder-connectivity-dot ${
                                                probePinStatus
                                                    ? 'active'
                                                    : hasTriggered
                                                    ? 'verified'
                                                    : 'untested'
                                            }`}
                                        />
                                        <span
                                            className={`bore-center-finder-connectivity-text ${
                                                probePinStatus
                                                    ? 'active'
                                                    : hasTriggered
                                                    ? 'verified'
                                                    : 'untested'
                                            }`}
                                        >
                                            {probePinStatus
                                                ? '3D Probe: Contact Triggered'
                                                : hasTriggered
                                                ? '3D Probe: Connectivity Verified ✓'
                                                : '3D Probe: Not Tested (Touch tip to test)'}
                                        </span>
                                    </div>
                                )
                            )}
                        </div>

                        <div className="bore-center-finder-footer-right">
                            {isRunning ? (
                                <button onClick={handleCancel} className="bore-center-finder-btn bore-center-finder-btn-stop">
                                    ⏹ Stop Probing
                                </button>
                            ) : (
                                <button
                                    onClick={handleRun}
                                    disabled={!isFormValid || isRunning || isAlarm || (connectivityTest && !hasTriggered)}
                                    className="bore-center-finder-btn bore-center-finder-btn-run"
                                    title={
                                        isAlarm
                                            ? 'Machine is locked in Alarm state. Please unlock machine before probing.'
                                            : !isFormValid
                                            ? `Please enter estimated ${probeMode} diameter`
                                            : connectivityTest && !hasTriggered
                                            ? 'Please touch/deflect probe tip to verify connectivity before running'
                                            : probeMode === 'bore' ? 'Find Bore Center' : 'Find Boss Center'
                                    }
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="9"></circle>
                                        <circle cx="12" cy="12" r="3"></circle>
                                        <line x1="12" y1="1" x2="12" y2="5"></line>
                                        <line x1="12" y1="19" x2="12" y2="23"></line>
                                        <line x1="1" y1="12" x2="5" y2="12"></line>
                                        <line x1="19" y1="12" x2="23" y2="12"></line>
                                    </svg>
                                    {isAlarm
                                        ? 'Machine in Alarm (Unlock First)'
                                        : connectivityTest && !hasTriggered && isFormValid
                                        ? 'Verify Probe Circuit First'
                                        : probeMode === 'bore' ? 'Find Bore Center' : 'Find Boss Center'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>

            {dialogState !== 'idle' && ReactDOM.createPortal(
                <div className="bore-center-finder-confirmation-overlay">
                    <div className="bore-center-finder-confirmation-dialog">
                        <div className={`bore-center-finder-confirmation-title ${dialogState === 'success' ? 'success' : 'failed'}`}>
                            {dialogState === 'success' ? '✓ Probing Complete' : '⚠ Probing Failed'}
                        </div>
                        <div className="bore-center-finder-confirmation-message">
                            {dialogState === 'success'
                                ? `${probeMode === 'bore' ? 'Bore' : 'Boss'} center found and set as X0 Y0 on active workspace.`
                                : 'Probing stopped before finishing.'}
                        </div>
                        <button
                            onClick={handleCompletionAcknowledge}
                            className="bore-center-finder-confirmation-button"
                        >
                            OK
                        </button>
                    </div>
                </div>,
                document.body,
            )}
        </>,
        document.body,
    );
};

export default BoreCenterFinderModal;
