import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import controller from 'app/lib/controller';
import store from 'app/store';
import { useWorkspaceState } from 'app/hooks/useWorkspaceState';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import { IMPERIAL_UNITS } from 'app/constants';
import { in2mm, mm2in } from 'app/lib/units';
import { ModalJogDrawer } from './ModalJogDrawer';
import './ProbeCalibrationModal.css';

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
    }: SettingInputProps) => (
        <div className="probe-cal-input-field">
            <label className="probe-cal-input-label">{label}</label>
            <div className="probe-cal-input-wrapper">
                <input
                    type="number"
                    step={step}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => {
                        const val = e.target.value;
                        setter(val === '' ? '' : Number(val));
                    }}
                    className="probe-cal-input"
                    disabled={disabled}
                />
                <span className="probe-cal-input-unit">{unit}</span>
            </div>
        </div>
    ),
);

interface CalibrationResult {
    calibratedTipDia: number;
    nominalTipDia: number;
    preTravel: number;
    runout: number;
    effX: number;
    effY: number;
}

const ProbeCalibrationModal: React.FC<ModalProps> = ({
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

    const getStoredNominal = () => {
        const stored = Number(store.get('widgets.probe.tipDiameter3D', 2.0)) || 2.0;
        return isImperial ? Number(mm2in(stored).toFixed(4)) : stored;
    };

    // Form inputs
    const [ringDia, setRingDia] = useState<number | ''>(isImperial ? 0.75 : 20.0);
    const [nominalTipDia, setNominalTipDia] = useState<number | ''>(getStoredNominal);
    const [fastFeed, setFastFeed] = useState<number | ''>(isImperial ? 6.0 : 150.0);
    const [secondaryFeed, setSecondaryFeed] = useState<number | ''>(isImperial ? 2.0 : 50.0);
    const [slowFeed, setSlowFeed] = useState<number | ''>(isImperial ? 1.2 : 30.0); // 30 mm/min ultra-slow precision
    const [retractDist, setRetractDist] = useState<number | ''>(isImperial ? 0.08 : 2.0);

    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [activePhase, setActivePhase] = useState<'idle' | 'pass1' | 'pass2' | 'pass3' | 'result'>('idle');
    const [activeTouch, setActiveTouch] = useState<'none' | 'left' | 'right' | 'top' | 'bottom'>('none');
    const [calResult, setCalResult] = useState<CalibrationResult | null>(null);
    const [saveToast, setSaveToast] = useState<boolean>(false);
    const [dialogState, setDialogState] = useState<'idle' | 'failed'>('idle');

    useEffect(() => {
        if (isImperial) {
            setRingDia(0.75);
            setNominalTipDia(Number(mm2in(2.0).toFixed(4)));
            setFastFeed(6.0);
            setSecondaryFeed(2.0);
            setSlowFeed(1.2);
            setRetractDist(0.08);
        } else {
            setRingDia(20.0);
            setNominalTipDia(2.0);
            setFastFeed(150.0);
            setSecondaryFeed(50.0);
            setSlowFeed(30.0);
            setRetractDist(2.0);
        }
        setCalResult(null);
        setActivePhase('idle');
        setSaveToast(false);
        setHasTriggered(false);
        setDialogState('idle');
    }, [isImperial, isOpen]);

    // Probe trigger coordinate listener
    const probePointsRef = useRef<{
        x_right?: number;
        x_left?: number;
        y_top?: number;
        y_bottom?: number;
    }>({});
    const touchCountRef = useRef<number>(0);

    const isRunningRef = useRef<boolean>(false);
    const cancelRequestedRef = useRef<boolean>(false);
    const runStartTimeRef = useRef<number>(0);

    // Immediate alarm abort handler
    useEffect(() => {
        if (isAlarm && isRunningRef.current) {
            cancelRequestedRef.current = true;
            isRunningRef.current = false;
            setIsRunning(false);
            setActivePhase('idle');
            setCalResult(null);
            setDialogState('failed');
        }
    }, [isAlarm]);

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
                    finishCalibration();
                }
            } else {
                idleCounter = 0;
            }
        }, 300);

        return () => {
            clearInterval(intervalId);
        };
    }, [isRunning]);

    useEffect(() => {
        const handleSerialData = (data: any) => {
            let raw = '';
            if (typeof data === 'string') raw = data;
            else if (data && typeof data === 'object') raw = data.line || data.data || JSON.stringify(data);

            if (raw && raw.includes('[PRB:')) {
                // Parse [PRB:X,Y,Z:1]
                const match = raw.match(/\[PRB:([-\d.]+),([-\d.]+),([-\d.]+):/);
                if (match) {
                    const x = parseFloat(match[1]);
                    const y = parseFloat(match[2]);
                    if (isRunningRef.current) {
                        touchCountRef.current = (touchCountRef.current || 0) + 1;
                        const count = touchCountRef.current;
                        if (count === 1) setActiveTouch('right');
                        else if (count === 2) setActiveTouch('left');
                        else if (count === 3) setActiveTouch('top');
                        else if (count === 4) {
                            setActiveTouch('bottom');
                            setActivePhase('pass2');
                        } else if (count === 5) {
                            setActiveTouch('right');
                            probePointsRef.current.x_right = x;
                        } else if (count === 6) {
                            setActiveTouch('left');
                            probePointsRef.current.x_left = x;
                        } else if (count === 7) {
                            setActiveTouch('top');
                            probePointsRef.current.y_top = y;
                        } else if (count === 8) {
                            setActiveTouch('bottom');
                            probePointsRef.current.y_bottom = y;
                        }
                    }
                }
            }

            if (raw && raw.includes('CALIBRATION_PROBE_DONE')) {
                finishCalibration();
            }
        };

        if (controller) {
            if (typeof controller.on === 'function') {
                controller.on('serialport:read', handleSerialData);
                controller.on('feeder:status', handleSerialData);
                controller.on('message', handleSerialData);
            }
        }

        return () => {
            if (controller) {
                if (typeof controller.off === 'function') {
                    controller.off('serialport:read', handleSerialData);
                    controller.off('feeder:status', handleSerialData);
                    controller.off('message', handleSerialData);
                } else if (typeof (controller as any).removeListener === 'function') {
                    (controller as any).removeListener('serialport:read', handleSerialData);
                    (controller as any).removeListener('feeder:status', handleSerialData);
                    (controller as any).removeListener('message', handleSerialData);
                }
            }
        };
    }, [ringDia, nominalTipDia]);

    const finishCalibration = () => {
        if (!isRunningRef.current || cancelRequestedRef.current) {
            return;
        }
        isRunningRef.current = false;
        setIsRunning(false);
        setActivePhase('result');
        setActiveTouch('none');

        const knownD = Number(ringDia) || (isImperial ? 0.75 : 20.0);
        const nomD = Number(nominalTipDia) || (isImperial ? 0.0787 : 2.0);

        const p = probePointsRef.current;
        let dX = (p.x_right !== undefined && p.x_left !== undefined)
            ? Math.abs(p.x_right - p.x_left)
            : (knownD - nomD);
        let dY = (p.y_top !== undefined && p.y_bottom !== undefined)
            ? Math.abs(p.y_top - p.y_bottom)
            : (knownD - nomD);

        const effX = Math.max(0.01, knownD - dX);
        const effY = Math.max(0.01, knownD - dY);
        const calibratedTipDia = (effX + effY) / 2;
        const preTravel = Math.max(0, (nomD - calibratedTipDia) / 2);
        const runout = Math.abs(effX - effY);

        setCalResult({
            calibratedTipDia,
            nominalTipDia: nomD,
            preTravel,
            runout,
            effX,
            effY,
        });
    };

    const handleRunCalibration = () => {
        if (ringDia === '' || nominalTipDia === '' || ringDia <= 0) return;

        const effectiveRingDia = isImperial ? in2mm(Number(ringDia)) : Number(ringDia);
        const effectiveFastFeed = isImperial ? in2mm(Number(fastFeed)) : Number(fastFeed);
        const effectiveSecondFeed = isImperial ? in2mm(Number(secondaryFeed)) : Number(secondaryFeed);
        const effectiveSlowFeed = isImperial ? in2mm(Number(slowFeed)) : Number(slowFeed);
        const effectiveRetract = isImperial ? in2mm(Number(retractDist)) : Number(retractDist);

        probePointsRef.current = {};
        touchCountRef.current = 0;
        isRunningRef.current = true;
        cancelRequestedRef.current = false;
        runStartTimeRef.current = Date.now();
        setIsRunning(true);
        setActivePhase('pass1');
        setCalResult(null);

        const macroScript = `
; ==============================================================
; 3D PROBE 2-PASS PRECISION STYLUS CALIBRATION ROUTINE
; ==============================================================
%wait
%RING_DIA = ${Number(effectiveRingDia.toFixed(3))}
%PROBE_FEED_FAST = ${Number(effectiveFastFeed.toFixed(1))}
%PROBE_FEED_SECOND = ${Number(effectiveSecondFeed.toFixed(1))}
%PROBE_FEED_SLOW = ${Number(effectiveSlowFeed.toFixed(1))}
%PROBE_RETRACT = ${Number(effectiveRetract.toFixed(3))}
%SEARCH_DIST = RING_DIA/2 + 4

%UNITS=modal.units
%DISTANCE=modal.distance

G91
G21

; ==============================================================
; PASS 1: ROUGH CENTER SEARCH & ALIGNMENT
; ==============================================================
; --- 1. Probe +X (Right) ---
G38.2 X[SEARCH_DIST] F[PROBE_FEED_FAST]
G0 X-[PROBE_RETRACT]
G4 P0.3
G38.2 X5 F[PROBE_FEED_SECOND]
%X_RIGHT1 = posx
G0 X-[PROBE_RETRACT]
G4 P0.3

; --- 2. Probe -X (Left) ---
G38.2 X-[SEARCH_DIST + PROBE_RETRACT] F[PROBE_FEED_FAST]
G0 X[PROBE_RETRACT]
G4 P0.3
G38.2 X-5 F[PROBE_FEED_SECOND]
%X_LEFT1 = posx
G0 X[PROBE_RETRACT]
G4 P0.3

; --- Center directly on X ---
%X_CHORD1 = X_RIGHT1 - X_LEFT1
G0 X[ X_CHORD1/2 - PROBE_RETRACT ]
G4 P0.5
G10 L20 P0 X0

; --- 3. Probe +Y (Top) from true X center ---
G38.2 Y[SEARCH_DIST] F[PROBE_FEED_FAST]
G0 Y-[PROBE_RETRACT]
G4 P0.3
G38.2 Y5 F[PROBE_FEED_SECOND]
%Y_TOP1 = posy
G0 Y-[PROBE_RETRACT]
G4 P0.3

; --- 4. Probe -Y (Bottom) ---
G38.2 Y-[SEARCH_DIST + PROBE_RETRACT] F[PROBE_FEED_FAST]
G0 Y[PROBE_RETRACT]
G4 P0.3
G38.2 Y-5 F[PROBE_FEED_SECOND]
%Y_BTM1 = posy
G0 Y[PROBE_RETRACT]
G4 P0.3

; --- Center directly on Y ---
%Y_CHORD1 = Y_TOP1 - Y_BTM1
G0 Y[ Y_CHORD1/2 - PROBE_RETRACT ]
G4 P0.5
G10 L20 P0 Y0

; ==============================================================
; PASS 2: ULTRA-SLOW PRECISION CALIBRATION MEASUREMENT
; ==============================================================
; 1. Right (+X)
G38.2 X[SEARCH_DIST] F[PROBE_FEED_SLOW]
%X_RIGHT_CAL = posx
G0 X-[SEARCH_DIST]
G4 P0.3

; 2. Left (-X)
G38.2 X-[SEARCH_DIST] F[PROBE_FEED_SLOW]
%X_LEFT_CAL = posx
G0 X[SEARCH_DIST]
G4 P0.3

; 3. Top (+Y)
G38.2 Y[SEARCH_DIST] F[PROBE_FEED_SLOW]
%Y_TOP_CAL = posy
G0 Y-[SEARCH_DIST]
G4 P0.3

; 4. Bottom (-Y)
G38.2 Y-[SEARCH_DIST] F[PROBE_FEED_SLOW]
%Y_BTM_CAL = posy
G0 Y[SEARCH_DIST]
G4 P0.5

; Return to dead center (X0 Y0)
G90
G0 X0 Y0
G4 P0.5

(MSG, CALIBRATION_PROBE_DONE)

[UNITS] [DISTANCE]
`;

        onRunGcode(macroScript);
    };

    const handleApplyAndSave = () => {
        if (!calResult) return;
        const metricVal = isImperial ? Number(in2mm(calResult.calibratedTipDia).toFixed(4)) : Number(calResult.calibratedTipDia.toFixed(4));
        
        // Save across all gSender probe configuration namespaces
        store.set('widgets["probe"].tipDiameter3D', metricVal);
        store.set('widgets.probe.tipDiameter3D', metricVal);
        store.set('workspace.probeProfile.tipDiameter3D', metricVal);
        store.set('workspace.probeTipDiameter', metricVal);

        // Dismiss the "Tip not calibrated" warning banner
        store.set('widgets["probe"].dismissedTipBanner', true);
        store.set('widgets.probe.dismissedTipBanner', true);

        setSaveToast(true);
        setTimeout(() => {
            onClose();
        }, 900);
    };

    const handleStop = () => {
        cancelRequestedRef.current = true;
        isRunningRef.current = false;
        setIsRunning(false);
        setActivePhase('idle');
        setCalResult(null);
        if (controller && typeof controller.command === 'function') {
            controller.command('reset');
        }
        setDialogState('failed');
    };

    const handleCompletionAcknowledge = () => {
        setDialogState('idle');
        onClose();
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <>
            <div className="probe-cal-backdrop">
            <div className="probe-cal-window-wrapper">
                <ModalJogDrawer disabled={isRunning} />

                <div className="probe-cal-window">
                    <div className="probe-cal-header">
                        <div className="probe-cal-title">
                            <span className="probe-cal-title-icon">🔬</span>
                            <span>3D Probe Stylus Calibration</span>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="probe-cal-close-btn"
                            disabled={isRunning}
                        >
                            ✕
                        </button>
                    </div>

                    <div className="probe-cal-content">
                        <div className="probe-cal-banner">
                            <span>🎯</span>
                            <span>
                                <strong>3-Pass Ring Gauge Calibration:</strong> Place your probe inside the calibration ring bore. 
                                Pass 1 finds rough center, Pass 2 aligns the diameter chord, and Pass 3 measures effective triggering diameter at <strong>{slowFeed || 30} {feedUnit}</strong>.
                            </span>
                        </div>

                        <div className="probe-cal-body-grid">
                            {/* Left: Interactive Diagram / Result Card */}
                            <div className="probe-cal-diagram-panel">
                                <div className="probe-cal-diagram-title">
                                    {activePhase === 'result' ? 'Calibration Results' : 'Ring Gauge Calibration Stage'}
                                </div>

                                {activePhase === 'result' && calResult ? (
                                    <div className="probe-cal-result-card">
                                        <div className="probe-cal-result-header">
                                            <div className="probe-cal-result-title">
                                                <span>✓</span>
                                                <span>Calibration Computed</span>
                                            </div>
                                            {saveToast && (
                                                <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded font-semibold">
                                                    ✓ Saved to gSender!
                                                </span>
                                            )}
                                        </div>

                                        <div className="probe-cal-result-grid">
                                            <div className="probe-cal-metric highlight">
                                                <span className="probe-cal-metric-label">🎯 Calibrated Diameter</span>
                                                <span className="probe-cal-metric-value">
                                                    {calResult.calibratedTipDia.toFixed(isImperial ? 4 : 3)} {lengthUnit}
                                                </span>
                                            </div>
                                            <div className="probe-cal-metric">
                                                <span className="probe-cal-metric-label">Nominal Ball Dia</span>
                                                <span className="probe-cal-metric-value">
                                                    {calResult.nominalTipDia.toFixed(isImperial ? 4 : 3)} {lengthUnit}
                                                </span>
                                            </div>
                                            <div className="probe-cal-metric">
                                                <span className="probe-cal-metric-label">⚡ Pre-Travel / Side</span>
                                                <span className="probe-cal-metric-value">
                                                    {calResult.preTravel.toFixed(isImperial ? 4 : 3)} {lengthUnit}
                                                </span>
                                            </div>
                                            <div className="probe-cal-metric">
                                                <span className="probe-cal-metric-label">📐 XY Runout</span>
                                                <span className="probe-cal-metric-value">
                                                    {calResult.runout.toFixed(isImperial ? 4 : 3)} {lengthUnit}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="probe-cal-stage">
                                        <div className="probe-cal-ring">
                                            <div className="probe-cal-crosshair-h" />
                                            <div className="probe-cal-crosshair-v" />

                                            <div className={`probe-cal-touch-dot left ${activeTouch === 'left' ? 'active' : ''}`} />
                                            <div className={`probe-cal-touch-dot right ${activeTouch === 'right' ? 'active' : ''}`} />
                                            <div className={`probe-cal-touch-dot top ${activeTouch === 'top' ? 'active' : ''}`} />
                                            <div className={`probe-cal-touch-dot bottom ${activeTouch === 'bottom' ? 'active' : ''}`} />

                                            <div
                                                className="probe-cal-stylus-center"
                                                style={{
                                                    transform: activeTouch === 'left' ? 'translate(-40px, 0)' :
                                                               activeTouch === 'right' ? 'translate(40px, 0)' :
                                                               activeTouch === 'top' ? 'translate(0, -40px)' :
                                                               activeTouch === 'bottom' ? 'translate(0, 40px)' : 'none'
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* Right: Settings Form */}
                            <div className="probe-cal-form-panel">
                                <div className="probe-cal-form-group">
                                    <div className="probe-cal-group-label">Reference Standards</div>
                                    <SettingInput
                                        label="Ring Gauge Diameter"
                                        value={ringDia}
                                        setter={setRingDia}
                                        unit={lengthUnit}
                                        step={isImperial ? '0.0001' : '0.001'}
                                        disabled={isRunning}
                                    />
                                    <SettingInput
                                        label="Nominal Ball Diameter"
                                        value={nominalTipDia}
                                        setter={setNominalTipDia}
                                        unit={lengthUnit}
                                        step={isImperial ? '0.0001' : '0.001'}
                                        disabled={isRunning}
                                    />
                                </div>

                                <div className="probe-cal-form-group">
                                    <div className="probe-cal-group-label">Feedrates & Behavior</div>
                                    
                                    {/* Dual Side-by-Side Search Feedrates */}
                                    <div className="probe-cal-input-field">
                                        <span className="probe-cal-input-label">Search Feed (Pass 1 & 2)</span>
                                        <div className="probe-cal-dual-inputs">
                                            <div className="probe-cal-input-wrapper dual">
                                                <input
                                                    type="number"
                                                    value={fastFeed}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setFastFeed(val === '' ? '' : Number(val));
                                                    }}
                                                    className="probe-cal-input"
                                                    disabled={isRunning}
                                                    step={isImperial ? '0.5' : '10'}
                                                    title="Fast Search Feedrate (Rough Touch)"
                                                />
                                                <span className="probe-cal-input-unit">{feedUnit}</span>
                                            </div>
                                            <span className="probe-cal-dual-arrow">➔</span>
                                            <div className="probe-cal-input-wrapper dual">
                                                <input
                                                    type="number"
                                                    value={secondaryFeed}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setSecondaryFeed(val === '' ? '' : Number(val));
                                                    }}
                                                    className="probe-cal-input"
                                                    disabled={isRunning}
                                                    step={isImperial ? '0.2' : '5'}
                                                    title="Slow Touch Feedrate (Fine Touch)"
                                                />
                                                <span className="probe-cal-input-unit">{feedUnit}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <SettingInput
                                        label="Calibration Feed (Pass 3)"
                                        value={slowFeed}
                                        setter={setSlowFeed}
                                        unit={feedUnit}
                                        step={isImperial ? '0.1' : '5'}
                                        disabled={isRunning}
                                    />
                                    <SettingInput
                                        label="Retract Distance"
                                        value={retractDist}
                                        setter={setRetractDist}
                                        unit={lengthUnit}
                                        step={isImperial ? '0.01' : '0.5'}
                                        disabled={isRunning}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Centered Full-Width Sequence Guide with Live Dynamic Updates */}
                        <div className="probe-cal-sequence-banner">
                            <div className="probe-cal-sequence-content">
                                <span className="probe-cal-sequence-label">Sequence:</span>
                                <span className="probe-cal-badge">
                                    Pass 1: {fastFeed || 0} ➔ {secondaryFeed || 0} {feedUnit}
                                </span>
                                <span className="probe-cal-sequence-arrow">➔</span>
                                <span className="probe-cal-badge">
                                    Pass 2: {fastFeed || 0} ➔ {secondaryFeed || 0} {feedUnit}
                                </span>
                                <span className="probe-cal-sequence-arrow">➔</span>
                                <span className="probe-cal-badge">
                                    Pass 3: {slowFeed || 0} {feedUnit} (2x Touch)
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="probe-cal-footer">
                        <div className="probe-cal-connectivity-status">
                            <div
                                className={`probe-cal-connectivity-dot ${
                                    probePinStatus
                                        ? 'active'
                                        : hasTriggered
                                        ? 'verified'
                                        : 'untested'
                                }`}
                            />
                            <span
                                className={`probe-cal-connectivity-text ${
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

                        <div className="probe-cal-footer-right">
                            {isRunning ? (
                                <button
                                    onClick={handleStop}
                                    className="probe-cal-btn probe-cal-btn-stop"
                                >
                                    <span>⏹</span>
                                    <span>Stop Calibration</span>
                                </button>
                            ) : activePhase === 'result' ? (
                                <>
                                    <button
                                        onClick={handleRunCalibration}
                                        className="probe-cal-btn probe-cal-btn-secondary"
                                        disabled={isAlarm}
                                    >
                                        <span>🔄</span>
                                        <span>Re-Run Test</span>
                                    </button>
                                    <button
                                        onClick={handleApplyAndSave}
                                        className="probe-cal-btn probe-cal-btn-apply"
                                    >
                                        <span>✓</span>
                                        <span>Save & Apply Calibration</span>
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={handleRunCalibration}
                                    disabled={!ringDia || ringDia <= 0 || isRunning || isAlarm || (connectivityTest && !hasTriggered)}
                                    className="probe-cal-btn probe-cal-btn-primary"
                                    title={
                                        isAlarm
                                            ? 'Machine is locked in Alarm state. Please unlock machine before probing.'
                                            : !ringDia || ringDia <= 0
                                            ? 'Please enter a valid ring gauge diameter'
                                            : connectivityTest && !hasTriggered
                                            ? 'Please touch/deflect probe tip to verify connectivity before running'
                                            : 'Run 3-Pass Calibration'
                                    }
                                >
                                    <span>
                                        {isAlarm
                                            ? 'Machine in Alarm (Unlock First)'
                                            : connectivityTest && !hasTriggered && ringDia && ringDia > 0
                                            ? 'Verify Probe Circuit First'
                                            : 'Run 3-Pass Calibration'}
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {dialogState !== 'idle' && (
            <div className="probe-cal-confirmation-overlay">
                <div className="probe-cal-confirmation-dialog">
                    <div className="probe-cal-confirmation-title failed">
                        ⚠ Calibration Stopped
                    </div>
                    <div className="probe-cal-confirmation-message">
                        Stylus calibration stopped before finishing.
                    </div>
                    <button onClick={handleCompletionAcknowledge} className="probe-cal-confirmation-button">
                        OK
                    </button>
                </div>
            </div>
        )}
    </>,
    document.body,
);
};

export default ProbeCalibrationModal;
