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
        featureDia > 0 &&
        (probeMode === 'bore' || (typeof zLiftHeight === 'number' && !isNaN(zLiftHeight) && zLiftHeight > 0));

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
%PROBE_RETRACT_FEED = 1000
${hasCustomRapid ? `%RAPID_FEED = ${Number(effectiveRapidFeed.toFixed(1))}\n` : ''}%PROBE_RETRACT = ${Number(effectiveRetract.toFixed(3))}
%SEARCH_DIST = BORE_DIA/2 + 5

%UNITS=modal.units
%DISTANCE=modal.distance

G91
G21

; --- RECORD ESTIMATED START CENTER ---
%X_START = posx
%Y_START = posy

; --- 1. PROBE +X INSIDE RIGHT WALL ---
G38.2 X[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3
G38.2 X5 F[PROBE_FEED_SLOW]
%X_RIGHT = posx
G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3

; Return to estimated X center before searching -X
G90
${rapidCmd('X[X_START]')}
G4 P0.3
G91

; --- 2. PROBE -X INSIDE LEFT WALL ---
G38.2 X-[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3
G38.2 X-5 F[PROBE_FEED_SLOW]
%X_LEFT = posx
G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3

; --- 3. MOVE DIRECTLY TO TRUE X CENTER & ZERO X ---
%X_CENTER = (X_RIGHT + X_LEFT)/2
G90
${rapidCmd('X[X_CENTER]')}
G4 P0.5
G10 L20 P0 X0
G91

; --- 4. PROBE +Y INSIDE TOP WALL (FROM TRUE X CENTER) ---
G38.2 Y[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3
G38.2 Y5 F[PROBE_FEED_SLOW]
%Y_TOP = posy
G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3

; Return to estimated Y center before searching -Y
G90
${rapidCmd('Y[Y_START]')}
G4 P0.3
G91

; --- 5. PROBE -Y INSIDE BOTTOM WALL ---
G38.2 Y-[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3
G38.2 Y-5 F[PROBE_FEED_SLOW]
%Y_BTM = posy
G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3

; --- 6. MOVE DIRECTLY TO TRUE Y CENTER & ZERO Y ---
%Y_CENTER = (Y_TOP + Y_BTM)/2
G90
${rapidCmd('Y[Y_CENTER]')}
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
; BOSS / CYLINDER CENTER FINDER MACRO (FRONT-START Z-HOP)
; =========================================
%wait

%BOSS_DIA = ${Number(effectiveDia.toFixed(3))}
%PROBE_FEED_FAST = ${Number(effectiveFastFeed.toFixed(1))}
%PROBE_FEED_SLOW = ${Number(effectiveSlowFeed.toFixed(1))}
%PROBE_RETRACT_FEED = 1000
${hasCustomRapid ? `%RAPID_FEED = ${Number(effectiveRapidFeed.toFixed(1))}\n` : ''}%PROBE_RETRACT = ${Number(effectiveRetract.toFixed(3))}
%Z_LIFT = ${Number(effectiveZLift.toFixed(3))}
%CLEARANCE = 10
%SEARCH_DIST = BOSS_DIA/2 + CLEARANCE + 10

%UNITS=modal.units
%DISTANCE=modal.distance

; --- RECORD START POSITION IN FRONT (-Y) AT PROBING DEPTH ---
%X_START = posx
%Y_START = posy
%Z_DEPTH = posz
%Z_SAFE = posz + Z_LIFT

G21

; --- 1. PROBE FRONT (-Y) FACE DIRECTLY AT DEPTH ---
G91
G38.2 Y[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3
G38.2 Y5 F[PROBE_FEED_SLOW]
%Y_FRONT = posy
G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3

; --- 2. LIFT, HOP ACROSS TOP & PROBE BACK (+Y) FACE ---
G90
${rapidCmd('Z[Z_SAFE]')}
G4 P0.3
${rapidCmd('Y[Y_FRONT + BOSS_DIA + CLEARANCE]')}
G4 P0.3
${rapidCmd('Z[Z_DEPTH]')}
G4 P0.3

; Probe Front (-Y) into Back Face
G91
G38.2 Y-[CLEARANCE + 15] F[PROBE_FEED_FAST]
G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3
G38.2 Y-5 F[PROBE_FEED_SLOW]
%Y_BACK = posy
G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3

; --- 3. LIFT TO SAFE HEIGHT & ALIGN TO TRUE Y CENTER ---
G90
${rapidCmd('Z[Z_SAFE]')}
%Y_TRUE_CENTER = (Y_FRONT + Y_BACK)/2
${rapidCmd('Y[Y_TRUE_CENTER]')}
G4 P0.3

; --- 4. HOP TO LEFT (-X) FACE AT PROBING DEPTH ---
${rapidCmd('X[X_START - (BOSS_DIA/2 + CLEARANCE)]')}
G4 P0.3
${rapidCmd('Z[Z_DEPTH]')}
G4 P0.3

; Probe Right (+X) into Left Face
G91
G38.2 X[CLEARANCE + 15] F[PROBE_FEED_FAST]
G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3
G38.2 X5 F[PROBE_FEED_SLOW]
%X_LEFT = posx
G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3

; --- 5. LIFT, HOP ACROSS TOP & PROBE RIGHT (+X) FACE ---
G90
${rapidCmd('Z[Z_SAFE]')}
G4 P0.3
${rapidCmd('X[X_LEFT + BOSS_DIA + CLEARANCE]')}
G4 P0.3
${rapidCmd('Z[Z_DEPTH]')}
G4 P0.3

; Probe Left (-X) into Right Face
G91
G38.2 X-[CLEARANCE + 15] F[PROBE_FEED_FAST]
G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3
G38.2 X-5 F[PROBE_FEED_SLOW]
%X_RIGHT = posx
G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]
G4 P0.3

; --- 6. LIFT, MOVE TO TRUE CENTER & ZERO WORK OFFSET ---
G90
${rapidCmd('Z[Z_SAFE]')}
%X_TRUE_CENTER = (X_LEFT + X_RIGHT)/2
${rapidCmd('X[X_TRUE_CENTER] Y[Y_TRUE_CENTER]')}
G4 P0.5

; Zero work offset to exact center
G10 L20 P0 X0 Y0

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
                            : 'Position probe in open air in front of cylinder (-Y) at probing depth. Probes with safe Z-hops (Y then X) to find true center and zero X and Y.'}
                    </div>

                    <div className="bore-center-finder-body">
                        <div className={`bore-center-finder-diagram mode-${probeMode}`}>
                            <div className="bore-center-finder-diagram-line-h" />
                            <div className="bore-center-finder-diagram-line-v" />

                            {/* BORE DIAGRAM LAYER (Fades smoothly) */}
                            <div className={`bore-center-diagram-layer bore-layer ${probeMode === 'bore' ? 'active' : 'inactive'}`}>
                                <div className="bore-center-finder-bore-outer bore-mode">
                                    <div className="bore-internal-arrow top">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="18 15 12 9 6 15"></polyline>
                                        </svg>
                                    </div>
                                    <div className="bore-internal-arrow bottom">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </div>
                                    <div className="bore-internal-arrow left">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="15 18 9 12 15 6"></polyline>
                                        </svg>
                                    </div>
                                    <div className="bore-internal-arrow right">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="9 18 15 12 9 6"></polyline>
                                        </svg>
                                    </div>
                                </div>
                                <div className="bore-center-finder-target-ring" />
                                <div className="bore-center-finder-target-center" />

                                <div className="bore-center-finder-arrow-label top outward">
                                    <div className="bore-center-finder-arrow-dot" />
                                    <span className="bore-center-finder-arrow-text">+Y Wall</span>
                                </div>

                                <div className="bore-center-finder-arrow-label bottom outward">
                                    <div className="bore-center-finder-arrow-dot" />
                                    <span className="bore-center-finder-arrow-text">-Y Wall</span>
                                </div>

                                <div className="bore-center-finder-arrow-label left outward">
                                    <span className="bore-center-finder-arrow-text">-X Wall</span>
                                    <div className="bore-center-finder-arrow-dot" />
                                </div>

                                <div className="bore-center-finder-arrow-label right outward">
                                    <div className="bore-center-finder-arrow-dot" />
                                    <span className="bore-center-finder-arrow-text">+X Wall</span>
                                </div>
                            </div>

                            {/* BOSS DIAGRAM LAYER (Fades smoothly) */}
                            <div className={`bore-center-diagram-layer boss-layer ${probeMode === 'boss' ? 'active' : 'inactive'}`}>
                                <div className="bore-center-finder-boss-cylinder" />

                                {/* Outside Animated Inward Arrows for Boss Probing */}
                                <div className="boss-outside-arrow bottom">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="19" x2="12" y2="5" />
                                        <polyline points="5 12 12 5 19 12" />
                                    </svg>
                                </div>
                                <div className="boss-outside-arrow top">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <polyline points="19 12 12 19 5 12" />
                                    </svg>
                                </div>
                                <div className="boss-outside-arrow left">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                        <polyline points="12 5 19 12 12 19" />
                                    </svg>
                                </div>
                                <div className="boss-outside-arrow right">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="19" y1="12" x2="5" y2="12" />
                                        <polyline points="12 19 5 12 12 5" />
                                    </svg>
                                </div>

                                <div className="bore-center-finder-boss-start-point" title="Start probe in open air here (-Y front at probing depth)">
                                    <span className="bore-center-finder-boss-start-dot" />
                                    <span className="bore-center-finder-boss-start-text">Start (-Y Front)</span>
                                </div>

                                <div className="bore-center-finder-arrow-label bottom inward">
                                    <span className="bore-center-finder-arrow-text">1. -Y Front</span>
                                </div>

                                <div className="bore-center-finder-arrow-label top inward">
                                    <span className="bore-center-finder-arrow-text">2. +Y Back</span>
                                </div>

                                <div className="bore-center-finder-arrow-label left inward">
                                    <span className="bore-center-finder-arrow-text">3. -X Left</span>
                                </div>

                                <div className="bore-center-finder-arrow-label right inward">
                                    <span className="bore-center-finder-arrow-text">4. +X Right</span>
                                </div>
                            </div>

                            {/* BOSS Z-LIFT BOTTOM BAR (Inside diagram panel at bottom) */}
                            {probeMode === 'boss' && (
                                <div className="bore-center-boss-zlift-bar">
                                    <div className="bore-center-boss-zlift-main-row">
                                        <span className="bore-center-boss-zlift-label">🦘 Z-Hop Clearance Height:</span>
                                        <div className="bore-center-boss-zlift-input-group">
                                            <input
                                                type="number"
                                                value={zLiftHeight}
                                                onChange={(e) => setZLiftHeight(e.target.value === '' ? '' : Number(e.target.value))}
                                                disabled={isRunning}
                                                step={isImperial ? "0.05" : "1"}
                                                className="bore-center-boss-zlift-input"
                                            />
                                            <span className="bore-center-boss-zlift-unit">{lengthUnit}</span>
                                        </div>
                                    </div>
                                    <div className="bore-center-boss-zlift-note active">
                                        <span className="bore-center-boss-zlift-note-icon">ℹ️</span>
                                        <span>
                                            Height probe will lift above current Z depth to safely hop over the boss during probing.
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
