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
import './EdgeCornerFinderModal.css';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRunGcode: (gcode: string) => void;
    connectivityTest?: boolean;
    onOpenCalibration?: () => void;
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
        <div className="edge-corner-finder-input-field" title={title}>
            <label className="edge-corner-finder-input-label">{label}</label>
            <div className={`edge-corner-finder-input-wrapper ${disabled ? 'disabled' : ''}`}>
                <input
                    type="number"
                    step={step}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => {
                        const val = e.target.value;
                        setter(val === '' ? '' : Number(val));
                    }}
                    className="edge-corner-finder-input"
                    disabled={disabled}
                    title={title}
                />
                <span className="edge-corner-finder-input-unit">{unit}</span>
            </div>
        </div>
    ),
);

const EdgeCornerFinderModal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    onRunGcode,
    connectivityTest = false,
    onOpenCalibration,
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

    const getStoredRapidFeed = () => {
        const storedMetric = Number(store.get('widgets.probe.probeMovementSpeed', 0)) || 0;
        return isImperial ? Number(mm2in(storedMetric).toFixed(1)) : storedMetric;
    };

    const getStoredRetractDist = () => {
        const storedMetric = Number(store.get('widgets.probe.retractionDistance', 2.0)) || 2.0;
        return isImperial ? Number(mm2in(storedMetric).toFixed(3)) : storedMetric;
    };

    // Persistent selection & mode initialization
    const savedSelection = store.get('widgets.probe.3dEdgeSelection', null);

    const [probeMode, setProbeMode] = useState<'outside' | 'inside'>(() => {
        return savedSelection?.probeMode || 'outside';
    });

    const [probeZ, setProbeZ] = useState<boolean>(() => {
        return savedSelection ? !!savedSelection.probeZ : false;
    });
    const [probeLeftX, setProbeLeftX] = useState<boolean>(() => {
        return savedSelection ? !!savedSelection.probeLeftX : false;
    });
    const [probeRightX, setProbeRightX] = useState<boolean>(() => {
        return savedSelection ? !!savedSelection.probeRightX : false;
    });
    const [probeTopY, setProbeTopY] = useState<boolean>(() => {
        return savedSelection ? !!savedSelection.probeTopY : false;
    });
    const [probeBottomY, setProbeBottomY] = useState<boolean>(() => {
        return savedSelection ? !!savedSelection.probeBottomY : false;
    });

    // Form inputs synchronized with settings store
    const [tipDia, setTipDia] = useState<number | ''>(getStoredTipDia);
    const [fastFeed, setFastFeed] = useState<number | ''>(getStoredFastFeed);
    const [slowFeed, setSlowFeed] = useState<number | ''>(getStoredSlowFeed);
    const [rapidFeed, setRapidFeed] = useState<number | ''>(getStoredRapidFeed);
    const [retractDist, setRetractDist] = useState<number | ''>(getStoredRetractDist);

    const handleTipDiaChange = (val: number | '') => {
        setTipDia(val);
        if (typeof val === 'number' && !isNaN(val) && val > 0) {
            const metricVal = isImperial ? Number(in2mm(val).toFixed(3)) : val;
            store.set('widgets.probe.tipDiameter3D', metricVal);
            store.set('workspace.probeTipDiameter', metricVal);
            pubsub.publish('repopulate');
        }
    };

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

    const handleRapidFeedChange = (val: number | '') => {
        setRapidFeed(val);
        if (typeof val === 'number' && !isNaN(val) && val >= 0) {
            const metricVal = isImperial ? Number(in2mm(val).toFixed(1)) : val;
            store.set('widgets.probe.probeMovementSpeed', metricVal);
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
    const [showTipBanner, setShowTipBanner] = useState<boolean>(() => !store.get('widgets.probe.dismissedTipBanner', false));

    const persistSelection = (mode: 'outside' | 'inside', z: boolean, lx: boolean, rx: boolean, ty: boolean, by: boolean) => {
        store.set('widgets.probe.3dEdgeSelection', {
            probeMode: mode,
            probeZ: z,
            probeLeftX: lx,
            probeRightX: rx,
            probeTopY: ty,
            probeBottomY: by,
        });
    };

    useEffect(() => {
        setTipDia(getStoredTipDia());
        setFastFeed(getStoredFastFeed());
        setSlowFeed(getStoredSlowFeed());
        setRapidFeed(getStoredRapidFeed());
        setRetractDist(getStoredRetractDist());
        setHasTriggered(false);
        setShowTipBanner(!store.get('widgets.probe.dismissedTipBanner', false));
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

            if (rawLine && rawLine.includes('EDGE_PROBE_DONE')) {
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

    // Immediate alarm abort handler
    useEffect(() => {
        if (isAlarm && isRunningRef.current) {
            cancelRequestedRef.current = true;
            isRunningRef.current = false;
            setIsRunning(false);
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

    // Edge toggle handlers enforcing mutual exclusion between parallel edges & saving state
    const toggleLeftX = () => {
        if (isRunning) return;
        const next = !probeLeftX;
        setProbeLeftX(next);
        if (next) setProbeRightX(false);
        persistSelection(probeMode, probeZ, next, false, probeTopY, probeBottomY);
    };

    const toggleRightX = () => {
        if (isRunning) return;
        const next = !probeRightX;
        setProbeRightX(next);
        if (next) setProbeLeftX(false);
        persistSelection(probeMode, probeZ, false, next, probeTopY, probeBottomY);
    };

    const toggleTopY = () => {
        if (isRunning) return;
        const next = !probeTopY;
        setProbeTopY(next);
        if (next) setProbeBottomY(false);
        persistSelection(probeMode, probeZ, probeLeftX, probeRightX, next, false);
    };

    const toggleBottomY = () => {
        if (isRunning) return;
        const next = !probeBottomY;
        setProbeBottomY(next);
        if (next) setProbeTopY(false);
        persistSelection(probeMode, probeZ, probeLeftX, probeRightX, false, next);
    };

    const toggleZ = () => {
        if (isRunning || probeMode === 'inside') return;
        const next = !probeZ;
        setProbeZ(next);
        persistSelection(probeMode, next, probeLeftX, probeRightX, probeTopY, probeBottomY);
    };

    const handleSetMode = (newMode: 'outside' | 'inside') => {
        if (isRunning) return;
        setProbeMode(newMode);
        const nextZ = newMode === 'inside' ? false : probeZ;
        if (newMode === 'inside') setProbeZ(false);
        persistSelection(newMode, nextZ, probeLeftX, probeRightX, probeTopY, probeBottomY);
    };

    // Derived active corner
    const isTopLeft = probeLeftX && probeTopY;
    const isTopRight = probeRightX && probeTopY;
    const isBottomLeft = probeLeftX && probeBottomY;
    const isBottomRight = probeRightX && probeBottomY;
    const isCorner = isTopLeft || isTopRight || isBottomLeft || isBottomRight;

    // Derived active single edge
    const isSingleX = (probeLeftX || probeRightX) && !probeTopY && !probeBottomY;
    const isSingleY = (probeTopY || probeBottomY) && !probeLeftX && !probeRightX;
    const isSingleEdge = isSingleX || isSingleY;

    const isFormValid =
        (probeZ || probeLeftX || probeRightX || probeTopY || probeBottomY) &&
        typeof tipDia === 'number' &&
        !isNaN(tipDia) &&
        tipDia > 0;

    // Dynamic Instruction Generation
    const renderInstructionGuide = () => {
        if (isCorner) {
            let cornerName = 'Top-Right';
            let xEdgeName = probeLeftX ? 'Left (-X)' : 'Right (+X)';
            let yEdgeName = probeBottomY ? 'Front (-Y)' : 'Back (+Y)';

            if (isTopLeft) cornerName = 'Top-Left';
            else if (isTopRight) cornerName = 'Top-Right';
            else if (isBottomLeft) cornerName = 'Bottom-Left';
            else if (isBottomRight) cornerName = 'Bottom-Right';

            if (probeMode === 'inside') {
                return (
                    <>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">📍 1. Place Probe:</span>
                            <span className="edge-corner-finder-instruction-value">
                                Inside pocket near {cornerName} corner at probing depth
                            </span>
                        </div>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">⚡ 2. Probing Order:</span>
                            <div className="edge-corner-finder-instruction-value">
                                <span className="edge-corner-finder-pill">① Inside {xEdgeName}</span>
                                <span className="edge-corner-finder-pill-arrow">➔</span>
                                <span className="edge-corner-finder-pill">② Inside {yEdgeName}</span>
                            </div>
                        </div>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">🏁 3. Finish:</span>
                            <span className="edge-corner-finder-instruction-value">
                                Zeroes inside corner origin, retracts safely inward
                            </span>
                        </div>
                    </>
                );
            }

            if (probeZ) {
                return (
                    <>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">📍 1. Place Probe:</span>
                            <span className="edge-corner-finder-instruction-value">
                                Above material near {cornerName} corner
                            </span>
                        </div>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">⚡ 2. Probing Order:</span>
                            <div className="edge-corner-finder-instruction-value">
                                <span className="edge-corner-finder-pill">① Z Surface</span>
                                <span className="edge-corner-finder-pill-arrow">➔</span>
                                <span className="edge-corner-finder-pill">② {xEdgeName} Edge</span>
                                <span className="edge-corner-finder-pill-arrow">➔</span>
                                <span className="edge-corner-finder-pill">③ {yEdgeName} Edge</span>
                            </div>
                        </div>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">🏁 3. Finish:</span>
                            <span className="edge-corner-finder-instruction-value">
                                Zeroes X, Y, Z and returns safely to <strong>X0 Y0</strong>
                            </span>
                        </div>
                    </>
                );
            }

            return (
                <>
                    <div className="edge-corner-finder-instruction-row">
                        <span className="edge-corner-finder-instruction-label">📍 1. Place Probe:</span>
                        <span className="edge-corner-finder-instruction-value">
                            In open air outside {cornerName} corner (at probing depth)
                        </span>
                    </div>
                    <div className="edge-corner-finder-instruction-row">
                        <span className="edge-corner-finder-instruction-label">⚡ 2. Probing Order:</span>
                        <div className="edge-corner-finder-instruction-value">
                            <span className="edge-corner-finder-pill">① {xEdgeName} Edge</span>
                            <span className="edge-corner-finder-pill-arrow">➔</span>
                            <span className="edge-corner-finder-pill">② {yEdgeName} Edge</span>
                        </div>
                    </div>
                    <div className="edge-corner-finder-instruction-row">
                        <span className="edge-corner-finder-instruction-label">🏁 3. Finish:</span>
                        <span className="edge-corner-finder-instruction-value">
                            Zeroes X & Y, stops safely at retract distance
                        </span>
                    </div>
                </>
            );
        }

        if (isSingleEdge) {
            let edgeName = 'Left (-X)';
            if (probeLeftX) edgeName = 'Left (-X)';
            else if (probeRightX) edgeName = 'Right (+X)';
            else if (probeTopY) edgeName = 'Back/Top (+Y)';
            else if (probeBottomY) edgeName = 'Front/Bottom (-Y)';

            if (probeMode === 'inside') {
                return (
                    <>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">📍 1. Place Probe:</span>
                            <span className="edge-corner-finder-instruction-value">
                                Inside pocket near {edgeName} inside wall at probing depth
                            </span>
                        </div>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">⚡ 2. Probing Order:</span>
                            <div className="edge-corner-finder-instruction-value">
                                <span className="edge-corner-finder-pill">① Inside {edgeName} Wall</span>
                            </div>
                        </div>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">🏁 3. Finish:</span>
                            <span className="edge-corner-finder-instruction-value">
                                Zeroes inside wall datum, retracts safely inward
                            </span>
                        </div>
                    </>
                );
            }

            if (probeZ) {
                return (
                    <>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">📍 1. Place Probe:</span>
                            <span className="edge-corner-finder-instruction-value">
                                Above material near {edgeName} edge
                            </span>
                        </div>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">⚡ 2. Probing Order:</span>
                            <div className="edge-corner-finder-instruction-value">
                                <span className="edge-corner-finder-pill">① Z Surface</span>
                                <span className="edge-corner-finder-pill-arrow">➔</span>
                                <span className="edge-corner-finder-pill">② {edgeName} Edge</span>
                            </div>
                        </div>
                        <div className="edge-corner-finder-instruction-row">
                            <span className="edge-corner-finder-instruction-label">🏁 3. Finish:</span>
                            <span className="edge-corner-finder-instruction-value">
                                Zeroes coordinate origin, lifts to safe height
                            </span>
                        </div>
                    </>
                );
            }

            return (
                <>
                    <div className="edge-corner-finder-instruction-row">
                        <span className="edge-corner-finder-instruction-label">📍 1. Place Probe:</span>
                        <span className="edge-corner-finder-instruction-value">
                            Beside {edgeName} edge in open air ({isImperial ? '~0.2–0.4 in' : '~5–10mm'} away at depth)
                        </span>
                    </div>
                    <div className="edge-corner-finder-instruction-row">
                        <span className="edge-corner-finder-instruction-label">⚡ 2. Probing Order:</span>
                        <div className="edge-corner-finder-instruction-value">
                            <span className="edge-corner-finder-pill">① {edgeName} Edge</span>
                        </div>
                    </div>
                    <div className="edge-corner-finder-instruction-row">
                        <span className="edge-corner-finder-instruction-label">🏁 3. Finish:</span>
                        <span className="edge-corner-finder-instruction-value">
                            Zeroes edge datum, stops safely at retract distance
                        </span>
                    </div>
                </>
            );
        }

        if (probeZ) {
            return (
                <>
                    <div className="edge-corner-finder-instruction-row">
                        <span className="edge-corner-finder-instruction-label">📍 1. Place Probe:</span>
                        <span className="edge-corner-finder-instruction-value">
                            Above material top surface
                        </span>
                    </div>
                    <div className="edge-corner-finder-instruction-row">
                        <span className="edge-corner-finder-instruction-label">⚡ 2. Probing Order:</span>
                        <div className="edge-corner-finder-instruction-value">
                            <span className="edge-corner-finder-pill">① Z Top Surface</span>
                        </div>
                    </div>
                    <div className="edge-corner-finder-instruction-row">
                        <span className="edge-corner-finder-instruction-label">🏁 3. Finish:</span>
                        <span className="edge-corner-finder-instruction-value">
                            Zeroes Z to material surface, lifts to safe height
                        </span>
                    </div>
                </>
            );
        }

        return (
            <div className="edge-corner-finder-instruction-row">
                <span className="edge-corner-finder-instruction-value" style={{ color: '#94a3b8' }}>
                    Select at least one edge or corner on the diagram above to begin.
                </span>
            </div>
        );
    };

    const handleRun = () => {
        if (!isFormValid) return;

        cancelRequestedRef.current = false;
        hasCompletedRef.current = false;
        isRunningRef.current = true;
        runStartTimeRef.current = Date.now();
        setIsRunning(true);
        setDialogState('idle');

        const effectiveFastFeed = isImperial ? in2mm(Number(fastFeed)) : Number(fastFeed);
        const effectiveSlowFeed = isImperial ? in2mm(Number(slowFeed)) : Number(slowFeed);
        const effectiveRapidFeed = isImperial ? in2mm(Number(rapidFeed)) : Number(rapidFeed);
        const effectiveRetract = isImperial ? in2mm(Number(retractDist)) : Number(retractDist);
        const effectiveTipDia = isImperial ? in2mm(Number(tipDia)) : Number(tipDia);
        const effectiveTipRad = effectiveTipDia / 2;
        const effectiveZUnderSurface = -(effectiveRetract + effectiveTipDia);

        const hasCustomRapid = !isNaN(effectiveRapidFeed) && effectiveRapidFeed > 0;
        const rapidCmd = (coords: string) => (hasCustomRapid ? `G1 ${coords} F[RAPID_FEED]` : `G0 ${coords}`);

        let gcodeLines: string[] = [
            '; =========================================',
            probeMode === 'inside'
                ? '; INSIDE POCKET / CAVITY PROBE MACRO'
                : '; EDGE & CORNER FINDER PROBE MACRO',
            '; =========================================',
            '%wait',
            `%TIP_DIA = ${Number(effectiveTipDia.toFixed(3))}`,
            `%TIP_RAD = ${Number(effectiveTipRad.toFixed(3))}`,
            `%PROBE_FEED_FAST = ${Number(effectiveFastFeed.toFixed(1))}`,
            `%PROBE_FEED_SLOW = ${Number(effectiveSlowFeed.toFixed(1))}`,
            '%PROBE_RETRACT_FEED = 1000',
            ...(hasCustomRapid ? [`%RAPID_FEED = ${Number(effectiveRapidFeed.toFixed(1))}`] : []),
            `%PROBE_RETRACT = ${Number(effectiveRetract.toFixed(3))}`,
            `%Z_UNDER_SURFACE = ${Number(effectiveZUnderSurface.toFixed(3))}`,
            '%SEARCH_DIST = 50',
            '%Z_SAFE_LIFT = 5',
            '%CORNER_CLEARANCE = 28',
            '%Z_LIFT_TOTAL = [Z_SAFE_LIFT - Z_UNDER_SURFACE]',
            '',
            '%UNITS=modal.units',
            '%DISTANCE=modal.distance',
            '',
            'G91',
            'G21',
        ];

        // 1. Optional Z Top Surface Probe (Outside Mode Only)
        if (probeMode === 'outside' && probeZ) {
            gcodeLines.push(
                '',
                '; --- 1. PROBE Z TOP SURFACE ---',
                'G38.2 Z-50 F[PROBE_FEED_FAST]',
                'G1 Z[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                'G4 P0.3',
                'G38.2 Z-5 F[PROBE_FEED_SLOW]',
                'G1 Z[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                'G4 P1',
                'G10 L20 P0 Z[PROBE_RETRACT]',
                rapidCmd('Z[Z_LIFT_TOTAL]'),
            );
        }

        // 2. Probing Routines
        if (probeMode === 'inside') {
            // ==========================================
            // INSIDE POCKET PROBING ROUTINES
            // ==========================================
            if (isSingleEdge) {
                if (probeLeftX) {
                    // Inside Left (-X): moves in -X direction into inside left wall
                    gcodeLines.push(
                        '',
                        '; --- PROBE INSIDE LEFT WALL (-X) ---',
                        'G38.2 X-[SEARCH_DIST] F[PROBE_FEED_FAST]',
                        'G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                        'G4 P0.3',
                        'G38.2 X-5 F[PROBE_FEED_SLOW]',
                        'G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                        'G4 P1',
                        'G10 L20 P0 X[PROBE_RETRACT + TIP_RAD]',
                    );
                } else if (probeRightX) {
                    // Inside Right (+X): moves in +X direction into inside right wall
                    gcodeLines.push(
                        '',
                        '; --- PROBE INSIDE RIGHT WALL (+X) ---',
                        'G38.2 X[SEARCH_DIST] F[PROBE_FEED_FAST]',
                        'G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                        'G4 P0.3',
                        'G38.2 X5 F[PROBE_FEED_SLOW]',
                        'G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                        'G4 P1',
                        'G10 L20 P0 X-[PROBE_RETRACT + TIP_RAD]',
                    );
                } else if (probeBottomY) {
                    // Inside Front (-Y): moves in -Y direction into inside front wall
                    gcodeLines.push(
                        '',
                        '; --- PROBE INSIDE FRONT WALL (-Y) ---',
                        'G38.2 Y-[SEARCH_DIST] F[PROBE_FEED_FAST]',
                        'G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                        'G4 P0.3',
                        'G38.2 Y-5 F[PROBE_FEED_SLOW]',
                        'G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                        'G4 P1',
                        'G10 L20 P0 Y[PROBE_RETRACT + TIP_RAD]',
                    );
                } else if (probeTopY) {
                    // Inside Back (+Y): moves in +Y direction into inside back wall
                    gcodeLines.push(
                        '',
                        '; --- PROBE INSIDE BACK WALL (+Y) ---',
                        'G38.2 Y[SEARCH_DIST] F[PROBE_FEED_FAST]',
                        'G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                        'G4 P0.3',
                        'G38.2 Y5 F[PROBE_FEED_SLOW]',
                        'G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                        'G4 P1',
                        'G10 L20 P0 Y-[PROBE_RETRACT + TIP_RAD]',
                    );
                }
            } else if (isCorner) {
                // Inside Corner Probing: moves outward towards internal walls
                const xDir = probeLeftX ? -1 : 1; // -1 = Left (probes -X), 1 = Right (probes +X)
                const yDir = probeBottomY ? -1 : 1; // -1 = Front (probes -Y), 1 = Back (probes +Y)

                gcodeLines.push(
                    '',
                    '; --- PROBE INSIDE CORNER 1ST EDGE (X) ---',
                    `G38.2 X${xDir * 25} F[PROBE_FEED_FAST]`,
                    `G1 X${-xDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                    'G4 P0.3',
                    `G38.2 X${xDir * 5} F[PROBE_FEED_SLOW]`,
                    `G1 X${-xDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                    'G4 P1',
                    `G10 L20 P0 X${-xDir * (effectiveRetract + effectiveTipRad)}`,
                    rapidCmd(`X${-xDir * (effectiveRetract + 5)}`),
                    '',
                    '; --- PROBE INSIDE CORNER 2ND EDGE (Y) ---',
                    `G38.2 Y${yDir * 25} F[PROBE_FEED_FAST]`,
                    `G1 Y${-yDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                    'G4 P0.3',
                    `G38.2 Y${yDir * 5} F[PROBE_FEED_SLOW]`,
                    `G1 Y${-yDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                    'G4 P1',
                    `G10 L20 P0 Y${-yDir * (effectiveRetract + effectiveTipRad)}`,
                    '',
                    '; --- SAFE INTERNAL CAVITY CLEARANCE ---',
                    rapidCmd(`X${-xDir * (effectiveRetract + 5)} Y${-yDir * (effectiveRetract + 5)}`),
                );
            }
        } else {
            // ==========================================
            // OUTSIDE STOCK PROBING ROUTINES
            // ==========================================
            if (isSingleEdge) {
                if (probeLeftX) {
                    // Left edge (-X): Probing moves towards +X (into the material)
                    if (probeZ) {
                        gcodeLines.push(
                            '',
                            '; --- PROBE LEFT EDGE (-X) WITH Z ---',
                            rapidCmd('X-28'),
                            rapidCmd('Z-[Z_LIFT_TOTAL - Z_UNDER_SURFACE]'),
                            'G38.2 X[SEARCH_DIST] F[PROBE_FEED_FAST]',
                            'G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P0.3',
                            'G38.2 X5 F[PROBE_FEED_SLOW]',
                            'G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P1',
                            'G10 L20 P0 X-[PROBE_RETRACT + TIP_RAD]',
                            rapidCmd('Z[Z_LIFT_TOTAL]'),
                        );
                    } else {
                        gcodeLines.push(
                            '',
                            '; --- PROBE LEFT EDGE (-X) ---',
                            'G38.2 X[SEARCH_DIST] F[PROBE_FEED_FAST]',
                            'G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P0.3',
                            'G38.2 X5 F[PROBE_FEED_SLOW]',
                            'G1 X-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P1',
                            'G10 L20 P0 X-[PROBE_RETRACT + TIP_RAD]',
                        );
                    }
                } else if (probeRightX) {
                    // Right edge (+X): Probing moves towards -X (into the material)
                    if (probeZ) {
                        gcodeLines.push(
                            '',
                            '; --- PROBE RIGHT EDGE (+X) WITH Z ---',
                            rapidCmd('X28'),
                            rapidCmd('Z-[Z_LIFT_TOTAL - Z_UNDER_SURFACE]'),
                            'G38.2 X-[SEARCH_DIST] F[PROBE_FEED_FAST]',
                            'G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P0.3',
                            'G38.2 X-5 F[PROBE_FEED_SLOW]',
                            'G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P1',
                            'G10 L20 P0 X[PROBE_RETRACT + TIP_RAD]',
                            rapidCmd('Z[Z_LIFT_TOTAL]'),
                        );
                    } else {
                        gcodeLines.push(
                            '',
                            '; --- PROBE RIGHT EDGE (+X) ---',
                            'G38.2 X-[SEARCH_DIST] F[PROBE_FEED_FAST]',
                            'G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P0.3',
                            'G38.2 X-5 F[PROBE_FEED_SLOW]',
                            'G1 X[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P1',
                            'G10 L20 P0 X[PROBE_RETRACT + TIP_RAD]',
                        );
                    }
                } else if (probeBottomY) {
                    // Front/Bottom edge (-Y): Probing moves towards +Y (into the material)
                    if (probeZ) {
                        gcodeLines.push(
                            '',
                            '; --- PROBE FRONT EDGE (-Y) WITH Z ---',
                            rapidCmd('Y-28'),
                            rapidCmd('Z-[Z_LIFT_TOTAL - Z_UNDER_SURFACE]'),
                            'G38.2 Y[SEARCH_DIST] F[PROBE_FEED_FAST]',
                            'G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P0.3',
                            'G38.2 Y5 F[PROBE_FEED_SLOW]',
                            'G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P1',
                            'G10 L20 P0 Y-[PROBE_RETRACT + TIP_RAD]',
                            rapidCmd('Z[Z_LIFT_TOTAL]'),
                        );
                    } else {
                        gcodeLines.push(
                            '',
                            '; --- PROBE FRONT EDGE (-Y) ---',
                            'G38.2 Y[SEARCH_DIST] F[PROBE_FEED_FAST]',
                            'G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P0.3',
                            'G38.2 Y5 F[PROBE_FEED_SLOW]',
                            'G1 Y-[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P1',
                            'G10 L20 P0 Y-[PROBE_RETRACT + TIP_RAD]',
                        );
                    }
                } else if (probeTopY) {
                    // Back/Top edge (+Y): Probing moves towards -Y (into the material)
                    if (probeZ) {
                        gcodeLines.push(
                            '',
                            '; --- PROBE BACK EDGE (+Y) WITH Z ---',
                            rapidCmd('Y28'),
                            rapidCmd('Z-[Z_LIFT_TOTAL - Z_UNDER_SURFACE]'),
                            'G38.2 Y-[SEARCH_DIST] F[PROBE_FEED_FAST]',
                            'G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P0.3',
                            'G38.2 Y-5 F[PROBE_FEED_SLOW]',
                            'G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P1',
                            'G10 L20 P0 Y[PROBE_RETRACT + TIP_RAD]',
                            rapidCmd('Z[Z_LIFT_TOTAL]'),
                        );
                    } else {
                        gcodeLines.push(
                            '',
                            '; --- PROBE BACK EDGE (+Y) ---',
                            'G38.2 Y-[SEARCH_DIST] F[PROBE_FEED_FAST]',
                            'G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P0.3',
                            'G38.2 Y-5 F[PROBE_FEED_SLOW]',
                            'G1 Y[PROBE_RETRACT] F[PROBE_RETRACT_FEED]',
                            'G4 P1',
                            'G10 L20 P0 Y[PROBE_RETRACT + TIP_RAD]',
                        );
                    }
                }
            } else if (isCorner) {
                // Corner Probing (2 Adjacent Edges)
                const xDir = probeLeftX ? 1 : -1; // 1 = Left (-X, probes +X), -1 = Right (+X, probes -X)
                const yDir = probeBottomY ? 1 : -1; // 1 = Front (-Y, probes +Y), -1 = Back (+Y, probes -Y)

                if (probeZ) {
                    gcodeLines.push(
                        '',
                        '; --- PROBE CORNER 1ST EDGE (X) ---',
                        rapidCmd(`X${-xDir * 28}`),
                        rapidCmd('Z-[Z_LIFT_TOTAL - Z_UNDER_SURFACE]'),
                        `G38.2 X${xDir * 50} F[PROBE_FEED_FAST]`,
                        `G1 X${-xDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                        'G4 P0.3',
                        `G38.2 X${xDir * 5} F[PROBE_FEED_SLOW]`,
                        `G1 X${-xDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                        'G4 P1',
                        `G10 L20 P0 X${-xDir * (effectiveRetract + effectiveTipRad)}`,
                        '',
                        '; --- SAFE SWEEP AROUND CORNER IN OPEN AIR (AT DEPTH) ---',
                        rapidCmd(`X${-xDir * 5}`),
                        rapidCmd(`Y${-yDir * 28}`),
                        rapidCmd(`X${xDir * 28}`),
                        '',
                        '; --- PROBE CORNER 2ND EDGE (Y) ---',
                        `G38.2 Y${yDir * 50} F[PROBE_FEED_FAST]`,
                        `G1 Y${-yDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                        'G4 P0.3',
                        `G38.2 Y${yDir * 5} F[PROBE_FEED_SLOW]`,
                        `G1 Y${-yDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                        'G4 P1',
                        `G10 L20 P0 Y${-yDir * (effectiveRetract + effectiveTipRad)}`,
                        '',
                        '; --- LIFT SAFELY AND HOVER OVER CORNER ---',
                        'G90',
                        rapidCmd('Z[Z_SAFE_LIFT]'),
                        rapidCmd('X0 Y0'),
                    );
                } else {
                    gcodeLines.push(
                        '',
                        '; --- PROBE CORNER 1ST EDGE (X) ---',
                        `G38.2 X${xDir * 25} F[PROBE_FEED_FAST]`,
                        `G1 X${-xDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                        'G4 P0.3',
                        `G38.2 X${xDir * 5} F[PROBE_FEED_SLOW]`,
                        `G1 X${-xDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                        'G4 P1',
                        `G10 L20 P0 X${-xDir * (effectiveRetract + effectiveTipRad)}`,
                        rapidCmd(`X${-xDir * (effectiveRetract + 5)}`),
                        '',
                        '; --- PROBE CORNER 2ND EDGE (Y) ---',
                        `G38.2 Y${yDir * 25} F[PROBE_FEED_FAST]`,
                        `G1 Y${-yDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                        'G4 P0.3',
                        `G38.2 Y${yDir * 5} F[PROBE_FEED_SLOW]`,
                        `G1 Y${-yDir * effectiveRetract} F[PROBE_RETRACT_FEED]`,
                        'G4 P1',
                        `G10 L20 P0 Y${-yDir * (effectiveRetract + effectiveTipRad)}`,
                    );
                }
            }
        }

        gcodeLines.push(
            '',
            '(MSG, EDGE_PROBE_DONE)',
            '',
            '[UNITS] [DISTANCE]',
        );

        const fullMacro = gcodeLines.join('\n');
        onRunGcode(fullMacro);
    };

    const handleCancel = () => {
        cancelRequestedRef.current = true;
        isRunningRef.current = false;
        setIsRunning(false);
        setDialogState('failed');
        controller.command('reset');
    };

    const handleCompletionAcknowledge = () => {
        setDialogState('idle');
        onClose();
    };

    // Reset state on modal open
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

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <>
            <div className="edge-corner-finder-backdrop">
            <div className="edge-corner-finder-window-wrapper">
                <ModalJogDrawer disabled={isRunning} />
                <div className="edge-corner-finder-window">
                <div className="edge-corner-finder-header">
                    <div className="edge-corner-finder-title">
                        <span>📐</span>
                        <span>Edge & Corner Probing Tool</span>
                    </div>

                    <div className="edge-corner-header-actions">
                        {/* Segmented Outside / Inside Mode Toggle with Smooth Sliding Pill */}
                        <div className={`edge-corner-mode-toggle mode-${probeMode}`}>
                            <div className="edge-corner-mode-slider" />
                            <button
                                type="button"
                                onClick={() => handleSetMode('outside')}
                                className={`edge-corner-mode-btn ${probeMode === 'outside' ? 'active' : ''}`}
                                disabled={isRunning}
                                title="Probe external stock edges and corners"
                            >
                                <span>⬚</span>
                                <span>Outside</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetMode('inside')}
                                className={`edge-corner-mode-btn ${probeMode === 'inside' ? 'active' : ''}`}
                                disabled={isRunning}
                                title="Probe internal milled pocket / cavity walls and inside corners"
                            >
                                <span>▣</span>
                                <span>Inside Pocket</span>
                            </button>
                        </div>

                        <button
                            onClick={() => !isRunning && onClose()}
                            className="edge-corner-finder-close-btn"
                            disabled={isRunning}
                            title={isRunning ? 'Cannot close while probing is running' : 'Close'}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="edge-corner-finder-content">
                    {showTipBanner && (
                        <div className="edge-corner-finder-tip-banner">
                            <div className="edge-corner-finder-tip-text">
                                <span>💡</span>
                                <span>
                                    <strong>Calibrate Stylus:</strong> For dead center edge accuracy, calibrate your probe tip triggering diameter.
                                </span>
                                {onOpenCalibration && (
                                    <button
                                        type="button"
                                        className="ml-2 px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-xs font-semibold transition-colors"
                                        onClick={() => {
                                            onClose();
                                            onOpenCalibration();
                                        }}
                                    >
                                        Calibrate Now ➔
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                className="edge-corner-finder-tip-dismiss"
                                onClick={() => {
                                    setShowTipBanner(false);
                                    store.set('widgets.probe.dismissedTipBanner', true);
                                }}
                            >
                                Don't show again ✕
                            </button>
                        </div>
                    )}

                    {dialogState === 'success' && (
                        <div className="edge-corner-finder-status-dialog">
                            <span>✓</span>
                            <div>
                                <strong>Edge Probing Complete!</strong> Your selected datum edges/corner have been accurately zeroed in your active coordinate system.
                            </div>
                        </div>
                    )}

                    <div className="edge-corner-finder-body-grid">
                        {/* Interactive Diagram Panel */}
                        <div className="edge-corner-finder-diagram-panel">
                            <div className="edge-corner-finder-diagram-title">
                                {probeMode === 'inside' ? 'Select Inside Wall or Inside Corner' : 'Select Datum Edges & Surface'}
                            </div>

                            <div className="edge-corner-finder-interactive-stage">
                                {/* Back / Top Edge (+Y) */}
                                <button
                                    type="button"
                                    onClick={toggleTopY}
                                    disabled={isRunning}
                                    className={`edge-corner-finder-selector-btn top ${probeTopY ? 'selected' : ''}`}
                                    title={probeMode === 'inside' ? 'Probe Inside Back Wall (+Y)' : 'Probe Top / Back Edge (+Y)'}
                                >
                                    <span>{probeTopY ? '☑' : '☐'}</span>
                                    <span>{probeMode === 'inside' ? 'Inside +Y (Back)' : '+Y (Back)'}</span>
                                </button>

                                {/* Left Edge (-X) */}
                                <button
                                    type="button"
                                    onClick={toggleLeftX}
                                    disabled={isRunning}
                                    className={`edge-corner-finder-selector-btn left ${probeLeftX ? 'selected' : ''}`}
                                    title={probeMode === 'inside' ? 'Probe Inside Left Wall (-X)' : 'Probe Left Edge (-X)'}
                                >
                                    <span>{probeLeftX ? '☑' : '☐'}</span>
                                    <span>{probeMode === 'inside' ? 'Inside -X (Left)' : '-X (Left)'}</span>
                                </button>

                                {/* Center Workpiece Block / Hollow Pocket */}
                                <div
                                    className={`edge-corner-finder-stock-block mode-${probeMode} ${
                                        probeMode === 'inside' ? 'inside-mode' : ''
                                    } ${probeLeftX ? 'edge-left-active' : ''} ${
                                        probeRightX ? 'edge-right-active' : ''
                                    } ${probeTopY ? 'edge-top-active' : ''} ${
                                        probeBottomY ? 'edge-bottom-active' : ''
                                    }`}
                                >
                                    {/* Corner Intersection Glowing Target (Unified, glides smoothly) */}
                                    <div
                                        className={`edge-corner-finder-corner-marker ${
                                            isCorner ? 'active' : 'inactive'
                                        } ${
                                            isTopLeft
                                                ? 'top-left'
                                                : isTopRight
                                                ? 'top-right'
                                                : isBottomLeft
                                                ? 'bottom-left'
                                                : 'bottom-right'
                                        }`}
                                    />

                                    {/* Outside Surface Layer */}
                                    <div className={`edge-corner-outside-layer ${probeMode === 'outside' ? 'active' : 'inactive'}`}>
                                        <button
                                            type="button"
                                            onClick={toggleZ}
                                            disabled={isRunning || probeMode !== 'outside'}
                                            className={`edge-corner-finder-z-selector ${probeZ ? 'selected' : ''}`}
                                            title="Probe Top Z Surface before finding edges"
                                        >
                                            <span>{probeZ ? '☑' : '☐'}</span>
                                            <span>Z Surface</span>
                                        </button>
                                    </div>

                                    {/* Inside Pocket Cavity Layer */}
                                    <div className={`edge-corner-inside-cavity ${probeMode === 'inside' ? 'active' : 'inactive'}`}>
                                        <span className="edge-corner-inside-label">▣ Inside Pocket</span>

                                        {/* Inside Directional Arrows (pointing OUTWARD) */}
                                        <div className={`inside-arrow arrow-left ${probeLeftX ? 'active' : ''} ${
                                            isTopLeft ? 'corner-tl' : isBottomLeft ? 'corner-bl' : ''
                                        }`}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="19" y1="12" x2="5" y2="12" />
                                                <polyline points="12 19 5 12 12 5" />
                                            </svg>
                                        </div>
                                        <div className={`inside-arrow arrow-right ${probeRightX ? 'active' : ''} ${
                                            isTopRight ? 'corner-tr' : isBottomRight ? 'corner-br' : ''
                                        }`}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="5" y1="12" x2="19" y2="12" />
                                                <polyline points="12 5 19 12 12 19" />
                                            </svg>
                                        </div>
                                        <div className={`inside-arrow arrow-top ${probeTopY ? 'active' : ''} ${
                                            isTopLeft ? 'corner-tl' : isTopRight ? 'corner-tr' : ''
                                        }`}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="19" x2="12" y2="5" />
                                                <polyline points="5 12 12 5 19 12" />
                                            </svg>
                                        </div>
                                        <div className={`inside-arrow arrow-bottom ${probeBottomY ? 'active' : ''} ${
                                            isBottomLeft ? 'corner-bl' : isBottomRight ? 'corner-br' : ''
                                        }`}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="5" x2="12" y2="19" />
                                                <polyline points="19 12 12 19 5 12" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Outside Dynamic Directional Probing Arrows Layer (Anchored to Rectangle) */}
                                    <div className={`edge-corner-outside-arrows-layer ${probeMode === 'outside' ? 'active' : 'inactive'}`}>
                                        <div
                                            className={`edge-corner-finder-edge-arrow arrow-left ${
                                                probeLeftX ? 'active' : 'inactive'
                                            } ${
                                                isTopLeft ? 'corner-tl' : isBottomLeft ? 'corner-bl' : ''
                                            }`}
                                        >
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="5" y1="12" x2="19" y2="12" />
                                                <polyline points="12 5 19 12 12 19" />
                                            </svg>
                                        </div>

                                        <div
                                            className={`edge-corner-finder-edge-arrow arrow-right ${
                                                probeRightX ? 'active' : 'inactive'
                                            } ${
                                                isTopRight ? 'corner-tr' : isBottomRight ? 'corner-br' : ''
                                            }`}
                                        >
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="19" y1="12" x2="5" y2="12" />
                                                <polyline points="12 19 5 12 12 5" />
                                            </svg>
                                        </div>

                                        <div
                                            className={`edge-corner-finder-edge-arrow arrow-top ${
                                                probeTopY ? 'active' : 'inactive'
                                            } ${
                                                isTopLeft ? 'corner-tl' : isTopRight ? 'corner-tr' : ''
                                            }`}
                                        >
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="5" x2="12" y2="19" />
                                                <polyline points="19 12 12 19 5 12" />
                                            </svg>
                                        </div>

                                        <div
                                            className={`edge-corner-finder-edge-arrow arrow-bottom ${
                                                probeBottomY ? 'active' : 'inactive'
                                            } ${
                                                isBottomLeft ? 'corner-bl' : isBottomRight ? 'corner-br' : ''
                                            }`}
                                        >
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="19" x2="12" y2="5" />
                                                <polyline points="5 12 12 5 19 12" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Edge (+X) */}
                                <button
                                    type="button"
                                    onClick={toggleRightX}
                                    disabled={isRunning}
                                    className={`edge-corner-finder-selector-btn right ${probeRightX ? 'selected' : ''}`}
                                    title={probeMode === 'inside' ? 'Probe Inside Right Wall (+X)' : 'Probe Right Edge (+X)'}
                                >
                                    <span>{probeRightX ? '☑' : '☐'}</span>
                                    <span>{probeMode === 'inside' ? 'Inside +X (Right)' : '+X (Right)'}</span>
                                </button>

                                {/* Front / Bottom Edge (-Y) */}
                                <button
                                    type="button"
                                    onClick={toggleBottomY}
                                    disabled={isRunning}
                                    className={`edge-corner-finder-selector-btn bottom ${probeBottomY ? 'selected' : ''}`}
                                    title={probeMode === 'inside' ? 'Probe Inside Front Wall (-Y)' : 'Probe Front / Bottom Edge (-Y)'}
                                >
                                    <span>{probeBottomY ? '☑' : '☐'}</span>
                                    <span>{probeMode === 'inside' ? 'Inside -Y (Front)' : '-Y (Front)'}</span>
                                </button>
                            </div>

                            {/* Probing Order Instruction Guide with Step Pills */}
                            <div className="edge-corner-finder-instruction-card">
                                {renderInstructionGuide()}
                            </div>
                        </div>

                        {/* Settings & Parameters Panel */}
                        <div className="edge-corner-finder-settings-panel">
                            <div className="edge-corner-finder-form-group">
                                <div className="edge-corner-finder-form-group-label">3D Probe Stylus</div>
                                <SettingInput
                                    label="Probe Tip Diameter"
                                    value={tipDia}
                                    setter={() => {}}
                                    unit={lengthUnit}
                                    step={isImperial ? '0.005' : '0.01'}
                                    disabled={true}
                                    title="Calibrated stylus diameter can only be modified in Probe Settings or Stylus Calibration"
                                />
                                <div className="edge-corner-finder-setting-note">
                                    <span>🔒</span>
                                    <span>Tip diameter is locked. Change in <strong>Probe Settings</strong> or <strong>Stylus Calibration</strong>.</span>
                                </div>
                            </div>

                            <div className="edge-corner-finder-form-group">
                                <div className="edge-corner-finder-form-group-label">Feedrates</div>
                                <SettingInput
                                    label="Fast Search Feed"
                                    value={fastFeed}
                                    setter={handleFastFeedChange}
                                    unit={feedUnit}
                                    step={isImperial ? '0.5' : '10'}
                                    disabled={isRunning}
                                />
                                <SettingInput
                                    label="Slow Precision Feed"
                                    value={slowFeed}
                                    setter={handleSlowFeedChange}
                                    unit={feedUnit}
                                    step={isImperial ? '0.1' : '1'}
                                    disabled={isRunning}
                                />
                                <SettingInput
                                    label="Probe Movement Speed (0 = Max)"
                                    value={rapidFeed}
                                    setter={handleRapidFeedChange}
                                    unit={feedUnit}
                                    step={isImperial ? '1' : '50'}
                                    disabled={isRunning}
                                    title="Feed rate for retract/reposition moves during probing. If 0, these moves use rapid (G0 / max machine speed). If set, they use a controlled feed move (G1) at this speed."
                                />
                            </div>

                            <div className="edge-corner-finder-form-group">
                                <div className="edge-corner-finder-form-group-label">Motion Behavior</div>
                                <SettingInput
                                    label="Retract Distance"
                                    value={retractDist}
                                    setter={handleRetractDistChange}
                                    unit={lengthUnit}
                                    step={isImperial ? '0.01' : '0.1'}
                                    disabled={isRunning}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="edge-corner-finder-footer">
                    <div className="edge-corner-finder-footer-left">
                        {isRunning ? (
                            <div className="edge-corner-finder-running-status">
                                <div className="edge-corner-finder-running-dot" />
                                <span>Running edge probing routine...</span>
                            </div>
                        ) : (
                            connectivityTest && (
                                <div className="edge-corner-finder-connectivity-status">
                                    <div
                                        className={`edge-corner-finder-connectivity-dot ${
                                            probePinStatus
                                                ? 'active'
                                                : hasTriggered
                                                ? 'verified'
                                                : 'untested'
                                        }`}
                                    />
                                    <span
                                        className={`edge-corner-finder-connectivity-text ${
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

                    <div className="edge-corner-finder-footer-right">
                        {isRunning ? (
                            <button
                                onClick={handleCancel}
                                className="edge-corner-finder-btn edge-corner-finder-btn-stop"
                            >
                                <span>⏹</span>
                                <span>Stop Probing</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleRun}
                                disabled={!isFormValid || isAlarm || (connectivityTest && !hasTriggered)}
                                className="edge-corner-finder-btn edge-corner-finder-btn-primary"
                                title={
                                    isAlarm
                                        ? 'Machine is locked in Alarm state. Please unlock machine before probing.'
                                        : !isFormValid
                                        ? 'Select at least one edge, corner, or Z surface on the diagram above to begin'
                                        : connectivityTest && !hasTriggered
                                        ? 'Please touch/deflect probe tip to verify connectivity before running'
                                        : 'Start Probing'
                                }
                            >
                                <span>
                                    {isAlarm
                                        ? 'Machine in Alarm (Unlock First)'
                                        : connectivityTest && !hasTriggered && isFormValid
                                        ? 'Verify Probe Circuit First'
                                        : 'Start Probing'}
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>

    {dialogState !== 'idle' && (
        <div className="edge-corner-finder-confirmation-overlay">
            <div className="edge-corner-finder-confirmation-dialog">
                <div className={`edge-corner-finder-confirmation-title ${dialogState === 'success' ? 'success' : 'failed'}`}>
                    {dialogState === 'success' ? '✓ Probing Complete' : '⚠ Probing Stopped'}
                </div>
                <div className="edge-corner-finder-confirmation-message">
                    {dialogState === 'success'
                        ? 'Selected edges probed and work coordinate origin updated.'
                        : 'Probing stopped before finishing.'}
                </div>
                <button onClick={handleCompletionAcknowledge} className="edge-corner-finder-confirmation-button">
                    OK
                </button>
            </div>
        </div>
    )}
    </>,
    document.body,
    );
};

export default EdgeCornerFinderModal;
