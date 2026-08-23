import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import controller, { addControllerEvents, removeControllerEvents } from 'app/lib/controller';
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
    const { probePinStatus, activeState, wpos } = useTypedSelector((state) => ({
        probePinStatus: state.controller.state.status?.pinState.P ?? false,
        activeState: state.controller.state.status?.activeState ?? 'Idle',
        wpos: state.controller.state.status?.wpos ?? { x: '0', y: '0', z: '0' },
    }));
    const isAlarm = activeState === 'Alarm' || activeState === 'Hold';
    const [hasTriggered, setHasTriggered] = useState<boolean>(false);
    const startCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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
    const [slowFeed, setSlowFeed] = useState<number | ''>(isImperial ? 2.0 : 50.0); // 50 mm/min precision calibration
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
            setSlowFeed(2.0);
            setRetractDist(0.08);
        } else {
            setRingDia(20.0);
            setNominalTipDia(2.0);
            setFastFeed(150.0);
            setSecondaryFeed(50.0);
            setSlowFeed(50.0);
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
            else if (data && typeof data === 'object') raw = data.line || data.data || data.raw || data.message || JSON.stringify(data);

            if (raw) {
                if (raw.includes('CAL_STAGE_1_DONE') || raw.includes('CAL_STAGE_2')) {
                    setActivePhase('pass2');
                } else if (raw.includes('CAL_STAGE_2_DONE') || raw.includes('CAL_STAGE_3')) {
                    setActivePhase('pass3');
                } else if (raw.includes('CAL_STAGE_1')) {
                    setActivePhase('pass1');
                }

                if (raw.includes('CAL_XR:')) {
                    const match = raw.match(/CAL_XR:([-\d.]+)/);
                    if (match) {
                        probePointsRef.current.x_right = parseFloat(match[1]);
                    }
                    setActiveTouch('right');
                } else if (raw.includes('CAL_XL:')) {
                    const match = raw.match(/CAL_XL:([-\d.]+)/);
                    if (match) {
                        probePointsRef.current.x_left = parseFloat(match[1]);
                    }
                    setActiveTouch('left');
                } else if (raw.includes('CAL_YT:')) {
                    const match = raw.match(/CAL_YT:([-\d.]+)/);
                    if (match) {
                        probePointsRef.current.y_top = parseFloat(match[1]);
                    }
                    setActiveTouch('top');
                } else if (raw.includes('CAL_YB:')) {
                    const match = raw.match(/CAL_YB:([-\d.]+)/);
                    if (match) {
                        probePointsRef.current.y_bottom = parseFloat(match[1]);
                    }
                    setActiveTouch('bottom');
                }

                if (raw.includes('[PRB:') && isRunningRef.current) {
                    touchCountRef.current = (touchCountRef.current || 0) + 1;
                    const count = touchCountRef.current;

                    if (count < 8) {
                        setActivePhase('pass1');
                    } else if (count === 8) {
                        // Pass 1 all 4 walls probed: advance to Pass 2 as machine returns to center
                        setTimeout(() => {
                            if (isRunningRef.current) {
                                setActivePhase('pass2');
                                setActiveTouch('none');
                            }
                        }, 700);
                    } else if (count < 16) {
                        setActivePhase('pass2');
                    } else if (count === 16) {
                        // Pass 2 all 4 walls probed: advance to Pass 3 as machine returns to center
                        setTimeout(() => {
                            if (isRunningRef.current) {
                                setActivePhase('pass3');
                                setActiveTouch('none');
                            }
                        }, 900);
                    } else if (count < 24) {
                        setActivePhase('pass3');
                    } else if (count >= 24) {
                        // Pass 3 measurement completed: finish calibration as machine returns to center
                        setTimeout(() => {
                            if (isRunningRef.current) {
                                finishCalibration();
                            }
                        }, 900);
                    }

                    const mod = count % 8;
                    if (mod === 1 || mod === 2) setActiveTouch('right');
                    else if (mod === 3 || mod === 4) setActiveTouch('left');
                    else if (mod === 5 || mod === 6) setActiveTouch('top');
                    else if (mod === 7 || mod === 0) setActiveTouch('bottom');

                    const match = raw.match(/\[PRB:([-\d.]+),([-\d.]+),([-\d.]+):/);
                    if (match) {
                        const x = parseFloat(match[1]);
                        const y = parseFloat(match[2]);

                        // Capture exact Stage 3 measurement touches
                        if (count === 17 || count === 18) {
                            probePointsRef.current.x_right = x;
                        } else if (count === 19 || count === 20) {
                            probePointsRef.current.x_left = x;
                        } else if (count === 21 || count === 22) {
                            probePointsRef.current.y_top = y;
                        } else if (count === 23 || count === 24) {
                            probePointsRef.current.y_bottom = y;
                        } else if (count >= 17) {
                            const s3 = count - 16;
                            if (s3 === 1 || s3 === 2) probePointsRef.current.x_right = x;
                            else if (s3 === 3 || s3 === 4) probePointsRef.current.x_left = x;
                            else if (s3 === 5 || s3 === 6) probePointsRef.current.y_top = y;
                            else if (s3 === 7 || s3 === 8) probePointsRef.current.y_bottom = y;
                        }
                    }
                }

                if (raw.includes('CALIBRATION_PROBE_DONE')) {
                    finishCalibration();
                }
            }
        };

        const events = {
            'serialport:read': handleSerialData,
            'feeder:status': handleSerialData,
            'message': handleSerialData,
        };

        addControllerEvents(events);

        return () => {
            removeControllerEvents(events);
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

        startCenterRef.current = {
            x: parseFloat(wpos.x) || 0,
            y: parseFloat(wpos.y) || 0,
        };
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
; 3D PROBE 3-PASS PRECISION STYLUS CALIBRATION ROUTINE
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

; --- RECORD ESTIMATED START CENTER ---
%X_START = posx
%Y_START = posy

; ==============================================================
; PASS 1: ROUGH CENTER SEARCH & ALIGNMENT (Rapids: 1000 mm/min)
; ==============================================================
(MSG, CAL_STAGE_1)

; --- 1. Probe +X (Right) ---
G38.2 X[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 X-[PROBE_RETRACT] F1000
G4 P0.3
G38.2 X5 F[PROBE_FEED_SECOND]
%X_RIGHT1 = posx
G1 X-[PROBE_RETRACT] F1000
G4 P0.3

; Return to estimated X center before searching -X
G90
G1 X[X_START] F1000
G4 P0.3
G91

; --- 2. Probe -X (Left) ---
G38.2 X-[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 X[PROBE_RETRACT] F1000
G4 P0.3
G38.2 X-5 F[PROBE_FEED_SECOND]
%X_LEFT1 = posx
G1 X[PROBE_RETRACT] F1000
G4 P0.3

; --- Center directly on X & Zero X ---
%X_CENTER1 = (X_RIGHT1 + X_LEFT1) / 2
G90
G1 X[X_CENTER1] F1000
G4 P0.5
G10 L20 P0 X0
G91

; --- 3. Probe +Y (Top) from true X center ---
G38.2 Y[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 Y-[PROBE_RETRACT] F1000
G4 P0.3
G38.2 Y5 F[PROBE_FEED_SECOND]
%Y_TOP1 = posy
G1 Y-[PROBE_RETRACT] F1000
G4 P0.3

; Return to estimated Y center before searching -Y
G90
G1 Y[Y_START] F1000
G4 P0.3
G91

; --- 4. Probe -Y (Bottom) ---
G38.2 Y-[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 Y[PROBE_RETRACT] F1000
G4 P0.3
G38.2 Y-5 F[PROBE_FEED_SECOND]
%Y_BTM1 = posy
G1 Y[PROBE_RETRACT] F1000
G4 P0.3

; --- Center directly on Y & Zero Y ---
%Y_CENTER1 = (Y_TOP1 + Y_BTM1) / 2
G90
G1 Y[Y_CENTER1] F1000
G4 P0.5
G10 L20 P0 Y0
G91
(MSG, CAL_STAGE_1_DONE)

; ==============================================================
; PASS 2: FINE CENTER VERIFICATION & RE-ZEROING (Rapids: 600 mm/min)
; ==============================================================
(MSG, CAL_STAGE_2)

; --- 1. Probe +X (Right) ---
G38.2 X[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 X-[PROBE_RETRACT] F600
G4 P0.3
G38.2 X5 F[PROBE_FEED_SECOND]
%X_RIGHT2 = posx
G1 X-[PROBE_RETRACT] F600
G4 P0.3

; Return to X0
G90
G1 X0 F600
G4 P0.3
G91

; --- 2. Probe -X (Left) ---
G38.2 X-[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 X[PROBE_RETRACT] F600
G4 P0.3
G38.2 X-5 F[PROBE_FEED_SECOND]
%X_LEFT2 = posx
G1 X[PROBE_RETRACT] F600
G4 P0.3

; --- Re-Center on X & Re-Zero X ---
%X_CENTER2 = (X_RIGHT2 + X_LEFT2) / 2
G90
G1 X[X_CENTER2] F600
G4 P0.5
G10 L20 P0 X0
G91

; --- 3. Probe +Y (Top) ---
G38.2 Y[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 Y-[PROBE_RETRACT] F600
G4 P0.3
G38.2 Y5 F[PROBE_FEED_SECOND]
%Y_TOP2 = posy
G1 Y-[PROBE_RETRACT] F600
G4 P0.3

; Return to Y0
G90
G1 Y0 F600
G4 P0.3
G91

; --- 4. Probe -Y (Bottom) ---
G38.2 Y-[SEARCH_DIST] F[PROBE_FEED_FAST]
G1 Y[PROBE_RETRACT] F600
G4 P0.3
G38.2 Y-5 F[PROBE_FEED_SECOND]
%Y_BTM2 = posy
G1 Y[PROBE_RETRACT] F600
G4 P0.3

; --- Re-Center on Y & Re-Zero Y ---
%Y_CENTER2 = (Y_TOP2 + Y_BTM2) / 2
G90
G1 Y[Y_CENTER2] F600
G4 P0.5
G10 L20 P0 Y0
G91
(MSG, CAL_STAGE_2_DONE)

; ==============================================================
; PASS 3: PRECISION STYLUS MEASUREMENT (Rapids: 200 mm/min, Feed: 50 mm/min)
; ==============================================================
(MSG, CAL_STAGE_3)

; --- 1. Probe +X (Right) 2-touch at 50 mm/min ---
G38.2 X[SEARCH_DIST] F[PROBE_FEED_SLOW]
G1 X-[PROBE_RETRACT] F200
G4 P0.3
G38.2 X5 F[PROBE_FEED_SLOW]
%X_RIGHT3 = posx
(MSG, CAL_XR:[posx])
G1 X-[PROBE_RETRACT] F200
G4 P0.3

; Return to X0
G90
G1 X0 F200
G4 P0.3
G91

; --- 2. Probe -X (Left) 2-touch at 50 mm/min ---
G38.2 X-[SEARCH_DIST] F[PROBE_FEED_SLOW]
G1 X[PROBE_RETRACT] F200
G4 P0.3
G38.2 X-5 F[PROBE_FEED_SLOW]
%X_LEFT3 = posx
(MSG, CAL_XL:[posx])
G1 X[PROBE_RETRACT] F200
G4 P0.3

; Return to X0
G90
G1 X0 F200
G4 P0.3
G91

; --- 3. Probe +Y (Top) 2-touch at 50 mm/min ---
G38.2 Y[SEARCH_DIST] F[PROBE_FEED_SLOW]
G1 Y-[PROBE_RETRACT] F200
G4 P0.3
G38.2 Y5 F[PROBE_FEED_SLOW]
%Y_TOP3 = posy
(MSG, CAL_YT:[posy])
G1 Y-[PROBE_RETRACT] F200
G4 P0.3

; Return to Y0
G90
G1 Y0 F200
G4 P0.3
G91

; --- 4. Probe -Y (Bottom) 2-touch at 50 mm/min ---
G38.2 Y-[SEARCH_DIST] F[PROBE_FEED_SLOW]
G1 Y[PROBE_RETRACT] F200
G4 P0.3
G38.2 Y-5 F[PROBE_FEED_SLOW]
%Y_BTM3 = posy
(MSG, CAL_YB:[posy])
G1 Y[PROBE_RETRACT] F200
G4 P0.3

; Return to absolute center (X0 Y0)
G90
G1 X0 Y0 F200
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

    const getPassState = (passNumber: 1 | 2 | 3): 'pending' | 'active' | 'completed' => {
        if (activePhase === 'result') return 'completed';
        if (!isRunning) return 'pending';
        if (passNumber === 1) {
            if (activePhase === 'pass1') return 'active';
            if (activePhase === 'pass2' || activePhase === 'pass3') return 'completed';
        }
        if (passNumber === 2) {
            if (activePhase === 'pass1') return 'pending';
            if (activePhase === 'pass2') return 'active';
            if (activePhase === 'pass3') return 'completed';
        }
        if (passNumber === 3) {
            if (activePhase === 'pass3') return 'active';
            return 'pending';
        }
        return 'pending';
    };

    const currentRadius = (Number(ringDia) || (isImperial ? 0.75 : 22.0)) / 2;
    const maxPx = 56;
    const liveX = parseFloat(wpos.x) || 0;
    const liveY = parseFloat(wpos.y) || 0;
    const relX = activePhase === 'pass1'
        ? (liveX - (startCenterRef.current?.x || 0))
        : liveX;
    const relY = activePhase === 'pass1'
        ? (liveY - (startCenterRef.current?.y || 0))
        : liveY;

    const stylusOffsetX = isRunning
        ? Math.max(-maxPx, Math.min(maxPx, (relX / currentRadius) * maxPx))
        : 0;

    const stylusOffsetY = isRunning
        ? Math.max(-maxPx, Math.min(maxPx, -(relY / currentRadius) * maxPx))
        : 0;

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
                                Pass 1 finds rough center, Pass 2 verifies true center, and Pass 3 measures effective triggering diameter at <strong>{slowFeed || 50} {feedUnit}</strong>.
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

                                            <div className={`probe-cal-touch-dot left ${activeTouch === 'left' || stylusOffsetX <= -48 ? 'active' : ''}`} />
                                            <div className={`probe-cal-touch-dot right ${activeTouch === 'right' || stylusOffsetX >= 48 ? 'active' : ''}`} />
                                            <div className={`probe-cal-touch-dot top ${activeTouch === 'top' || stylusOffsetY <= -48 ? 'active' : ''}`} />
                                            <div className={`probe-cal-touch-dot bottom ${activeTouch === 'bottom' || stylusOffsetY >= 48 ? 'active' : ''}`} />

                                            <div
                                                className="probe-cal-stylus-center"
                                                style={{
                                                    transform: `translate(${stylusOffsetX.toFixed(1)}px, ${stylusOffsetY.toFixed(1)}px)`
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
                                <span className={`probe-cal-badge ${getPassState(1)}`}>
                                    {getPassState(1) === 'completed' && <span className="probe-cal-check">✓ </span>}
                                    Pass 1: {fastFeed || 0} ➔ {secondaryFeed || 0} {feedUnit}
                                </span>
                                <span className="probe-cal-sequence-arrow">➔</span>
                                <span className={`probe-cal-badge ${getPassState(2)}`}>
                                    {getPassState(2) === 'completed' && <span className="probe-cal-check">✓ </span>}
                                    Pass 2: {fastFeed || 0} ➔ {secondaryFeed || 0} {feedUnit}
                                </span>
                                <span className="probe-cal-sequence-arrow">➔</span>
                                <span className={`probe-cal-badge ${getPassState(3)}`}>
                                    {getPassState(3) === 'completed' && <span className="probe-cal-check">✓ </span>}
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
