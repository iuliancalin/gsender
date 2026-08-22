import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import controller from 'app/lib/controller';
import store from 'app/store';
import { useWorkspaceState } from 'app/hooks/useWorkspaceState';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import { IMPERIAL_UNITS } from 'app/constants';
import { in2mm, mm2in } from 'app/lib/units';
import { ModalJogDrawer } from './ModalJogDrawer';
import './MaterialCenterFinderModal.css';

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
        <div className="material-center-finder-input-field" title={title}>
            <label className="material-center-finder-input-label">{label}</label>
            <div className={`material-center-finder-input-wrapper ${disabled ? 'disabled' : ''}`}>
                <input
                    type="number"
                    step={step}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => {
                        const val = e.target.value;
                        setter(val === '' ? '' : Number(val));
                    }}
                    className="material-center-finder-input"
                    disabled={disabled}
                    title={title}
                />
                <span className="material-center-finder-input-unit">{unit}</span>
            </div>
        </div>
    ),
);

const MaterialCenterFinderModal: React.FC<ModalProps> = ({
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

    const getTipDia = () => {
        const storedMetric = Number(store.get('widgets.probe.tipDiameter3D', store.get('workspace.probeTipDiameter', 2.0))) || 2.0;
        return isImperial ? Number(mm2in(storedMetric).toFixed(3)) : storedMetric;
    };

    const [sizeX, setSizeX] = useState<number | ''>('');
    const [sizeY, setSizeY] = useState<number | ''>('');
    const [fastFeed, setFastFeed] = useState<number>(isImperial ? 6.0 : 150.0);
    const [slowFeed, setSlowFeed] = useState<number>(isImperial ? 2.0 : 50.0);
    const [retractDist, setRetractDist] = useState<number>(isImperial ? 0.08 : 2.0);
    const [safeZ, setSafeZ] = useState<number>(isImperial ? 0.2 : 5.0);
    const [tipDia, setTipDia] = useState<number | ''>(getTipDia);
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [dialogState, setDialogState] = useState<'idle' | 'success' | 'failed'>('idle');

    useEffect(() => {
        const storedMetric = Number(store.get('widgets.probe.tipDiameter3D', store.get('workspace.probeTipDiameter', 2.0))) || 2.0;

        if (isImperial) {
            setFastFeed(6.0);
            setSlowFeed(2.0);
            setRetractDist(0.08);
            setSafeZ(0.2);
            setTipDia(Number(mm2in(storedMetric).toFixed(3)));
        } else {
            setFastFeed(150.0);
            setSlowFeed(50.0);
            setRetractDist(2.0);
            setSafeZ(5.0);
            setTipDia(storedMetric);
        }
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

            if (rawLine && rawLine.includes('MATERIAL_CENTER_DONE')) {
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

    // Polling interval to catch state when serial string / feeder event is missed
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
            if (Date.now() - runStartTimeRef.current < 1500) {
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

    useEffect(() => {
        if (isOpen) {
            cancelRequestedRef.current = false;
            isRunningRef.current = false;
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
        typeof sizeX === 'number' &&
        !isNaN(sizeX) &&
        sizeX > 0 &&
        typeof sizeY === 'number' &&
        !isNaN(sizeY) &&
        sizeY > 0 &&
        typeof tipDia === 'number' &&
        !isNaN(tipDia) &&
        tipDia > 0;

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

        const effectiveSizeX = isImperial ? in2mm(Number(sizeX)) : Number(sizeX);
        const effectiveSizeY = isImperial ? in2mm(Number(sizeY)) : Number(sizeY);
        const effectiveFastFeed = isImperial ? in2mm(Number(fastFeed)) : Number(fastFeed);
        const effectiveSlowFeed = isImperial ? in2mm(Number(slowFeed)) : Number(slowFeed);
        const effectiveRetract = isImperial ? in2mm(Number(retractDist)) : Number(retractDist);
        const effectiveSafeZ = isImperial ? in2mm(Number(safeZ)) : Number(safeZ);
        const effectiveTipDia = isImperial ? in2mm(Number(tipDia)) : Number(tipDia);
        const effectiveZUnderSurface = -(effectiveRetract + effectiveTipDia);

        const macroScript = `
; =========================================
; MATERIAL CENTER FINDER MACRO
; =========================================
%wait

%STOCK_X = ${Number(effectiveSizeX.toFixed(3))}
%STOCK_Y = ${Number(effectiveSizeY.toFixed(3))}
%PROBE_FEED_FAST = ${Number(effectiveFastFeed.toFixed(1))}
%PROBE_FEED_SLOW = ${Number(effectiveSlowFeed.toFixed(1))}
%PROBE_RETRACT = ${Number(effectiveRetract.toFixed(3))}
%Z_SAFE_LIFT = ${Number(effectiveSafeZ.toFixed(3))}
%Z_UNDER_SURFACE = ${Number(effectiveZUnderSurface.toFixed(3))}
%EDGE_MARGIN_MAJOR = 10 
%EDGE_MARGIN = 5

%UNITS=modal.units
%DISTANCE=modal.distance

G91
G21

; --- PROBE Z ---
G38.2 Z-50 F[PROBE_FEED_FAST]
G0 Z[PROBE_RETRACT]
G38.2 Z-5 F[PROBE_FEED_SLOW]
G0 Z[PROBE_RETRACT]
G4 P1
G10 L20 P0 Z[PROBE_RETRACT]
%Z_LIFT_TOTAL = Z_SAFE_LIFT - Z_UNDER_SURFACE
G0 Z[Z_LIFT_TOTAL]

; --- PROBE X EDGES ---
G0 X[ STOCK_X/2 + EDGE_MARGIN_MAJOR ]
G0 Z-[Z_LIFT_TOTAL - Z_UNDER_SURFACE]
G38.2 X-[ STOCK_X + 2*EDGE_MARGIN ] F[PROBE_FEED_FAST]
G0 X[PROBE_RETRACT]
G38.2 X-5 F[PROBE_FEED_SLOW]
%X_RIGHT = posx
G0 X[PROBE_RETRACT]
G0 Z[Z_LIFT_TOTAL]

G0 X-[ STOCK_X + 2*EDGE_MARGIN ]
G0 Z-[Z_LIFT_TOTAL]
G38.2 X[ STOCK_X + 2*EDGE_MARGIN ] F[PROBE_FEED_FAST]
G0 X-[PROBE_RETRACT]
G38.2 X5 F[PROBE_FEED_SLOW]
%X_LEFT = posx
G0 X-[PROBE_RETRACT]
G0 Z[Z_LIFT_TOTAL]

; Calculate middle of X chord and return to center
%X_CHORD = X_RIGHT - X_LEFT
G10 L20 P0 X[X_LEFT]
G0 X[X_CHORD/2 + PROBE_RETRACT]
%X_CENTER = posx
G4 P1
G10 L20 P0 X0

; --- PROBE Y EDGES ---
G0 Y[ STOCK_Y/2 + EDGE_MARGIN_MAJOR ]
G0 Z-[Z_LIFT_TOTAL]
G38.2 Y-[ STOCK_Y + 2*EDGE_MARGIN ] F[PROBE_FEED_FAST]
G0 Y[PROBE_RETRACT]
G38.2 Y-5 F[PROBE_FEED_SLOW]
%Y_TOP = posy
G0 Y[PROBE_RETRACT]
G0 Z[Z_LIFT_TOTAL]

G0 Y-[ STOCK_Y + 2*EDGE_MARGIN ]
G0 Z-[Z_LIFT_TOTAL]
G38.2 Y[ STOCK_Y + 2*EDGE_MARGIN ] F[PROBE_FEED_FAST]
G0 Y-[PROBE_RETRACT]
G38.2 Y5 F[PROBE_FEED_SLOW]
%Y_BTM = posy
G0 Y-[PROBE_RETRACT]
G0 Z[Z_LIFT_TOTAL]

; Calculate middle of Y chord and return to center
%Y_CHORD = Y_TOP - Y_BTM
G10 L20 P0 Y[Y_BTM]
G0 Y[Y_CHORD/2 + PROBE_RETRACT]
%Y_CENTER = posy
G4 P1
G10 L20 P0 Y0

(MSG, MATERIAL_CENTER_DONE)

[UNITS] [DISTANCE]
`;

        onRunGcode(macroScript);
    };

    const handleCancel = () => {
        cancelRequestedRef.current = true;
        isRunningRef.current = false;
        setIsRunning(false);

        if (controller && typeof controller.command === 'function') {
            controller.command('reset');
        }
        setDialogState('failed');
    };

    const handleCompletionAcknowledge = () => {
        setDialogState('idle');
        onClose();
    };

    return ReactDOM.createPortal(
        <>
            <div className="material-center-finder-overlay">
                <div className="material-center-finder-modal-wrapper">
                    <ModalJogDrawer disabled={isRunning} />
                    <div className="material-center-finder-modal">
                    <div className="material-center-finder-header">
                        <div className="material-center-finder-title">
                            <span className="material-center-finder-title-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="22" y1="12" x2="18" y2="12"></line>
                                    <line x1="6" y1="12" x2="2" y2="12"></line>
                                    <line x1="12" y1="6" x2="12" y2="2"></line>
                                    <line x1="12" y1="22" x2="12" y2="18"></line>
                                </svg>
                            </span>
                            Material Center Finder
                        </div>
                        <button
                            onClick={onClose}
                            className="material-center-finder-close-btn"
                            disabled={isRunning}
                            title={isRunning ? 'Cannot close while probing is running' : 'Close'}
                        >
                            ✕
                        </button>
                    </div>

                    <div className="material-center-finder-subtitle">
                        Probe the edges of your material to find the exact center. Place the probe roughly in the center of the material before starting. The macro will probe Z first then the edges and calculate the center point.
                    </div>

                    <div className="material-center-finder-body">
                        <div className="material-center-finder-diagram">
                            <div className="material-center-finder-diagram-line-h" />
                            <div className="material-center-finder-diagram-line-v" />
                            <div className="material-center-finder-material-block" />
                            <div className="material-center-finder-target-ring" />
                            <div className="material-center-finder-target-dot" />

                            <div className="material-center-finder-arrow-label top">
                                <span className="material-center-finder-arrow-text">+Y</span>
                                <div className="material-center-finder-arrow-dot" />
                                <span className="material-center-finder-arrow-symbol">↑</span>
                            </div>

                            <div className="material-center-finder-arrow-label bottom">
                                <span className="material-center-finder-arrow-symbol">↓</span>
                                <div className="material-center-finder-arrow-dot" />
                                <span className="material-center-finder-arrow-text">-Y</span>
                            </div>

                            <div className="material-center-finder-arrow-label left">
                                <span className="material-center-finder-arrow-text">-X</span>
                                <div className="material-center-finder-arrow-dot" />
                                <span className="material-center-finder-arrow-symbol">←</span>
                            </div>

                            <div className="material-center-finder-arrow-label right">
                                <span className="material-center-finder-arrow-symbol">→</span>
                                <div className="material-center-finder-arrow-dot" />
                                <span className="material-center-finder-arrow-text">+X</span>
                            </div>
                        </div>

                        <div className="material-center-finder-form-panel">
                            <div className="material-center-finder-form-group">
                                <div className="material-center-finder-form-group-label">Material Size (User Input)</div>
                                <SettingInput label="Size in X (Width)" value={sizeX} setter={setSizeX} unit={lengthUnit} step={isImperial ? "0.05" : "1"} disabled={isRunning} />
                                <SettingInput label="Size in Y (Length)" value={sizeY} setter={setSizeY} unit={lengthUnit} step={isImperial ? "0.05" : "1"} disabled={isRunning} />
                            </div>

                            <div className="material-center-finder-form-group">
                                <div className="material-center-finder-form-group-label">Probe Feedrates</div>
                                <SettingInput label="Fast Feed" value={fastFeed} setter={setFastFeed} unit={feedUnit} step={isImperial ? "0.5" : "10"} disabled={isRunning} />
                                <SettingInput label="Slow Feed" value={slowFeed} setter={setSlowFeed} unit={feedUnit} step={isImperial ? "0.1" : "1"} disabled={isRunning} />
                            </div>

                            <div className="material-center-finder-form-group">
                                <div className="material-center-finder-form-group-label">Probe Behavior</div>
                                <SettingInput
                                    label="Probe Tip Diameter"
                                    value={tipDia}
                                    setter={() => {}}
                                    unit={lengthUnit}
                                    step={isImperial ? "0.01" : "0.1"}
                                    disabled={true}
                                    title="Calibrated stylus diameter can only be modified in Probe Settings or Stylus Calibration"
                                />
                                <div className="material-center-finder-setting-note">
                                    <span>🔒</span>
                                    <span>Tip diameter is locked. Change in <strong>Probe Settings</strong> or <strong>Stylus Calibration</strong>.</span>
                                </div>
                                <SettingInput label="Retract Distance" value={retractDist} setter={setRetractDist} unit={lengthUnit} step={isImperial ? "0.01" : "0.1"} disabled={isRunning} />
                                <SettingInput label="Safe Z" value={safeZ} setter={setSafeZ} unit={lengthUnit} step={isImperial ? "0.05" : "0.5"} disabled={isRunning} />
                            </div>
                        </div>
                    </div>

                    <div className="material-center-finder-footer">
                        <div className="material-center-finder-footer-left">
                            {isRunning ? (
                                <div className="material-center-finder-running-status">
                                    <div className="material-center-finder-running-dot" />
                                    Running...
                                </div>
                            ) : (
                                connectivityTest && (
                                    <div className="material-center-finder-connectivity-status">
                                        <div
                                            className={`material-center-finder-connectivity-dot ${
                                                probePinStatus
                                                    ? 'active'
                                                    : hasTriggered
                                                    ? 'verified'
                                                    : 'untested'
                                            }`}
                                        />
                                        <span
                                            className={`material-center-finder-connectivity-text ${
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

                        <div className="material-center-finder-footer-right">
                            {isRunning ? (
                                <button onClick={handleCancel} className="material-center-finder-btn material-center-finder-btn-stop">
                                    ⏹ Stop Probing
                                </button>
                            ) : (
                                <button
                                    onClick={handleRun}
                                    disabled={!isFormValid || isRunning || isAlarm || (connectivityTest && !hasTriggered)}
                                    className="material-center-finder-btn material-center-finder-btn-run"
                                    title={
                                        isAlarm
                                            ? 'Machine is locked in Alarm state. Please unlock machine before probing.'
                                            : !isFormValid
                                            ? 'Please enter valid material dimensions for X and Y'
                                            : connectivityTest && !hasTriggered
                                            ? 'Please touch/deflect probe tip to verify connectivity before running'
                                            : 'Find Material Center'
                                    }
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="22" y1="12" x2="18" y2="12"></line>
                                        <line x1="6" y1="12" x2="2" y2="12"></line>
                                        <line x1="12" y1="6" x2="12" y2="2"></line>
                                        <line x1="12" y1="22" x2="12" y2="18"></line>
                                    </svg>
                                    {isAlarm
                                        ? 'Machine in Alarm (Unlock First)'
                                        : connectivityTest && !hasTriggered && isFormValid
                                        ? 'Verify Probe Circuit First'
                                        : 'Find Material Center'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>

            {dialogState !== 'idle' && ReactDOM.createPortal(
                <div className="material-center-finder-confirmation-overlay">
                    <div className="material-center-finder-confirmation-dialog">
                        <div className={`material-center-finder-confirmation-title ${dialogState === 'success' ? 'success' : 'failed'}`}>
                            {dialogState === 'success' ? '✓ Probing Complete' : '⚠ Probing Failed'}
                        </div>
                        <div className="material-center-finder-confirmation-message">
                            {dialogState === 'success'
                                ? 'Material center found and set as origin.'
                                : 'Probing stopped before finishing.'}
                        </div>
                        <button onClick={handleCompletionAcknowledge} className="material-center-finder-confirmation-button">
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

export default MaterialCenterFinderModal;