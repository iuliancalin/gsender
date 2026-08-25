/*
 * Copyright (C) 2021 Sienci Labs Inc.
 *
 * This file is part of gSender.
 *
 * gSender is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, under version 3 of the License.
 *
 * gSender is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gSender.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Contact for information regarding this program and its license
 * can be sent through gSender@sienci.com or mailed to the main office
 * of Sienci Labs Inc. in Waterloo, Ontario, Canada.
 *
 */

import React, { useCallback, useRef, useEffect } from 'react';
import cx from 'classnames';

import { Button as ShadcnButton } from 'app/components/shadcn/Button';
import { Button } from 'app/components/Button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from 'app/components/shadcn/Dropdown';

import { PROBING_CATEGORY } from '../../constants';
import ProbeImage from './ProbeImage';
import ProbeDiameter from './ProbeDiameter';
import { Actions, State } from './definitions';
import useKeybinding from 'app/lib/useKeybinding';
import useShuttleEvents from 'app/hooks/useShuttleEvents';
import Tooltip from 'app/components/Tooltip';
import { TOUCHPLATE_TYPES, TOUCHPLATE_TYPE_3D } from 'app/lib/constants';

type ProbeProps = {
    state: State;
    actions: Actions;
};

const Probe = ({ state, actions }: ProbeProps) => {
    // Use a ref to always have access to the latest state
    const stateRef = useRef(state);
    const actionsRef = useRef(actions);

    // Update the refs when state or actions change
    useEffect(() => {
        stateRef.current = state;
        actionsRef.current = actions;
    }, [state, actions]);

    // Create stable callbacks that always access the latest state via the ref
    const toggleProbeDialog = useCallback(() => {
        const { show } = stateRef.current;
        actionsRef.current.onOpenChange(!show);
    }, []);

    const probeRoutineScrollRight = useCallback(() => {
        const { availableProbeCommands, selectedProbeCommand } =
            stateRef.current;
        let newIndex = selectedProbeCommand + 1;
        if (availableProbeCommands.length <= newIndex) {
            newIndex = 0;
        }
        actionsRef.current.handleProbeCommandChange(newIndex);
    }, []);

    const probeRoutineScrollLeft = useCallback(() => {
        const { availableProbeCommands, selectedProbeCommand } =
            stateRef.current;
        let newIndex = selectedProbeCommand - 1;
        if (newIndex < 0) {
            newIndex = availableProbeCommands.length - 1;
        }
        actionsRef.current.handleProbeCommandChange(newIndex);
    }, []);

    const shuttleControlEvents = {
        OPEN_PROBE: {
            title: 'Display probe popup',
            keys: '',
            cmd: 'OPEN_PROBE',
            preventDefault: false,
            isActive: true,
            category: PROBING_CATEGORY,
            callback: toggleProbeDialog,
        },
        PROBE_ROUTINE_SCROLL_RIGHT: {
            title: 'Probe Routine scroll right',
            keys: '',
            cmd: 'PROBE_ROUTINE_SCROLL_RIGHT',
            preventDefault: false,
            isActive: true,
            category: PROBING_CATEGORY,
            callback: probeRoutineScrollRight,
        },
        PROBE_ROUTINE_SCROLL_LEFT: {
            title: 'Probe Routine scroll left',
            keys: '',
            cmd: 'PROBE_ROUTINE_SCROLL_LEFT',
            preventDefault: false,
            isActive: true,
            category: PROBING_CATEGORY,
            callback: probeRoutineScrollLeft,
        },
    };

    useShuttleEvents(shuttleControlEvents);
    useEffect(() => {
        useKeybinding(shuttleControlEvents);
    }, []);

    const {
        canClick,
        availableProbeCommands,
        selectedProbeCommand,
        touchplate,
        touchplateTypeSwitcher,
    } = state;

    const { touchplateType } = touchplate;
    const is3DProbe = touchplateType === TOUCHPLATE_TYPE_3D || touchplateType === '3D Probe';

    // 1. If 3D Probe is selected, display the dropdown switcher, 4 tool action buttons in 2x2 grid, and the 3D probe image graphic!
    if (is3DProbe) {
        const probeCommand = availableProbeCommands[selectedProbeCommand] || {
            id: 'XYZ Touch',
            safe: true,
            tool: false,
            axes: { x: true, y: true, z: true },
        };

        return (
            <div className="w-full h-full max-xl:pt-1">
                <div className="grid grid-cols-[5fr_3fr] w-full h-full items-center gap-2">
                    <div className="grid grid-rows-[auto_auto] gap-2.5 items-center justify-center max-w-full min-w-0">
                        {touchplateTypeSwitcher && (
                            <div className="flex items-center justify-center">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button aria-label="Change Probe Type" size="sm">
                                            {touchplateType}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-56 bg-white dark:bg-dark border border-gray-300 dark:border-gray-700">
                                        {Object.values(TOUCHPLATE_TYPES).map((tpt) => (
                                            <DropdownMenuItem
                                                key={tpt}
                                                onClick={() => actions.changeTouchPlateType(tpt)}
                                                className="flex items-center hover:bg-blue-100 transition-colors duration-200 cursor-pointer dark:hover:bg-dark-lighter px-3 py-1.5 text-sm"
                                            >
                                                {tpt}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2.5 w-full">
                            {/* Edge & Corner Finder Button */}
                            <button
                                type="button"
                                onClick={() => actions.openEdgeCornerModal()}
                                disabled={!canClick}
                                className="flex items-center gap-3 px-3 py-2 bg-slate-800/90 hover:bg-slate-700/90 active:bg-sky-600/30 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-sky-400 rounded-lg text-left transition-all group shadow-sm min-h-[46px]"
                                title="Open 3D Probe Edge & Corner Finder"
                            >
                                <div className="p-1.5 bg-sky-500/10 group-hover:bg-sky-500/20 border border-sky-500/30 rounded-md text-sky-400 shrink-0">
                                    <svg
                                        width="17"
                                        height="17"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M4 4v16h16" />
                                        <circle cx="9" cy="15" r="2.5" fill="currentColor" />
                                        <line x1="9" y1="9" x2="9" y2="12" />
                                        <line x1="12" y1="15" x2="15" y2="15" />
                                    </svg>
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-bold text-slate-100 group-hover:text-white truncate">
                                        Edge & Corner
                                    </span>
                                    <span className="text-[10px] text-slate-400 leading-tight truncate">
                                        Edges, Corner & Z
                                    </span>
                                </div>
                            </button>

                            {/* Material Center Finder Button */}
                            <button
                                type="button"
                                onClick={() => actions.openMaterialCenterModal()}
                                disabled={!canClick}
                                className="flex items-center gap-3 px-3 py-2 bg-slate-800/90 hover:bg-slate-700/90 active:bg-emerald-600/30 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-emerald-400 rounded-lg text-left transition-all group shadow-sm min-h-[46px]"
                                title="Open 3D Probe Material Center Finder"
                            >
                                <div className="p-1.5 bg-emerald-500/10 group-hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md text-emerald-400 shrink-0">
                                    <svg
                                        width="17"
                                        height="17"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <circle cx="12" cy="12" r="9" />
                                        <circle cx="12" cy="12" r="3" />
                                        <line x1="12" y1="1" x2="12" y2="5" />
                                        <line x1="12" y1="19" x2="12" y2="23" />
                                        <line x1="1" y1="12" x2="5" y2="12" />
                                        <line x1="19" y1="12" x2="23" y2="12" />
                                    </svg>
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-bold text-slate-100 group-hover:text-white truncate">
                                        Material Center
                                    </span>
                                    <span className="text-[10px] text-slate-400 leading-tight truncate">
                                        Stock Center
                                    </span>
                                </div>
                            </button>

                            {/* Bore / Hole Center Finder Button */}
                            <button
                                type="button"
                                onClick={() => actions.openBoreCenterModal()}
                                disabled={!canClick}
                                className="flex items-center gap-3 px-3 py-2 bg-slate-800/90 hover:bg-slate-700/90 active:bg-purple-600/30 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-purple-400 rounded-lg text-left transition-all group shadow-sm min-h-[46px]"
                                title="Open 3D Probe Bore / Hole Center Finder"
                            >
                                <div className="p-1.5 bg-purple-500/10 group-hover:bg-purple-500/20 border border-purple-500/30 rounded-md text-purple-400 shrink-0">
                                    <svg
                                        width="17"
                                        height="17"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <circle cx="12" cy="12" r="9" />
                                        <line x1="12" y1="7" x2="12" y2="17" />
                                        <line x1="7" y1="12" x2="17" y2="12" />
                                        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                                    </svg>
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-bold text-slate-100 group-hover:text-white truncate">
                                        Bore & Boss
                                    </span>
                                    <span className="text-[10px] text-slate-400 leading-tight truncate">
                                        Hole & Boss Center
                                    </span>
                                </div>
                            </button>

                            {/* Calibrate Stylus Button */}
                            <button
                                type="button"
                                onClick={() => actions.openCalibrationModal()}
                                disabled={!canClick}
                                className="flex items-center gap-3 px-3 py-2 bg-slate-800/90 hover:bg-slate-700/90 active:bg-amber-600/30 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-amber-400 rounded-lg text-left transition-all group shadow-sm min-h-[46px]"
                                title="Open 3D Probe Stylus Calibration (3-Pass Ring Gauge)"
                            >
                                <div className="p-1.5 bg-amber-500/10 group-hover:bg-amber-500/20 border border-amber-500/30 rounded-md text-amber-400 shrink-0">
                                    <svg
                                        width="17"
                                        height="17"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <circle cx="12" cy="12" r="9" />
                                        <circle cx="12" cy="12" r="2" fill="currentColor" />
                                        <line x1="12" y1="2" x2="12" y2="6" />
                                        <line x1="12" y1="18" x2="12" y2="22" />
                                        <line x1="2" y1="12" x2="6" y2="12" />
                                        <line x1="18" y1="12" x2="22" y2="12" />
                                    </svg>
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-bold text-slate-100 group-hover:text-white truncate">
                                        Calibrate Stylus
                                    </span>
                                    <span className="text-[10px] text-slate-400 leading-tight truncate">
                                        3-Pass Ring Cal
                                    </span>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="flex w-full h-full min-h-0 items-center justify-center">
                        <ProbeImage
                            touchplateType={touchplateType}
                            probeCommand={probeCommand}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // 2. Otherwise (Standard Block, AutoZero, Z Probe, BitZero, etc.), show standard Sienci probing interface!
    const probeCommand = availableProbeCommands[selectedProbeCommand];

    return (
        <div className="w-full h-full max-xl:pt-1">
            <div className="grid grid-cols-[5fr_3fr] w-full h-full items-center gap-2">
                <div className="grid grid-rows-[auto_auto_auto_auto] gap-1.5 items-center justify-center max-w-full min-w-0">
                    {touchplateTypeSwitcher && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button aria-label="Change Probe Type" size="sm">
                                    {touchplateType}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56 bg-white">
                                {Object.values(TOUCHPLATE_TYPES).map((tpt) => (
                                    <DropdownMenuItem
                                        key={tpt}
                                        onClick={() => actions.changeTouchPlateType(tpt)}
                                        className="flex items-center hover:bg-blue-100 transition-colors duration-200 cursor-pointer dark:hover:bg-dark-lighter"
                                    >
                                        {tpt}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    <div className="flex w-full bg-white dark:bg-dark rounded-md border-solid border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 p-[2px]">
                        {availableProbeCommands.map((command, index) => (
                            <Tooltip
                                content={`Probe using ${command.id}`}
                                key={command.id}
                            >
                                <ShadcnButton
                                    key={command.id}
                                    onClick={() =>
                                        actions.handleProbeCommandChange(index)
                                    }
                                    size="icon"
                                    aria-label={`Select probing routine ${command.id}`}
                                    aria-pressed={index === selectedProbeCommand}
                                    className={cx(
                                        'rounded-md relative h-[calc(4vh+3px)]',
                                        {
                                            'bg-blue-400 bg-opacity-30':
                                                index === selectedProbeCommand,
                                        },
                                    )}
                                >
                                    {command.id.split(' ')[0]}
                                </ShadcnButton>
                            </Tooltip>
                        ))}
                    </div>
                    <div
                        className={cx('flex items-center max-xl:px-6', {
                            hidden: !probeCommand?.tool,
                        })}
                    >
                        <ProbeDiameter
                            actions={actions}
                            state={state}
                            probeCommand={probeCommand}
                        />
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 max-w-full">
                        <Button
                            onClick={() => actions.onOpenChange(true)}
                            disabled={!canClick}
                            className="whitespace-nowrap"
                        >
                            Probe
                        </Button>
                    </div>
                </div>
                <div className="flex w-full h-full min-h-0 items-center justify-center">
                    <ProbeImage
                        touchplateType={touchplateType}
                        probeCommand={probeCommand}
                    />
                </div>
            </div>
        </div>
    );
};

export default Probe;