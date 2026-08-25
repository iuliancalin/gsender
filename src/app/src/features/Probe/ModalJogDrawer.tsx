import React, { useEffect, useState } from 'react';
import { Jogging } from 'app/features/Jogging';
import './ModalJogDrawer.css';

interface ModalJogDrawerProps {
    disabled?: boolean;
}

export const ModalJogDrawer: React.FC<ModalJogDrawerProps> = ({ disabled = false }) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [isReady, setIsReady] = useState<boolean>(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsReady(true);
        }, 1000);

        let resizeTimer: any = null;
        const mediaQuery = window.matchMedia('(orientation: portrait), (max-width: 1099px)');

        const handleLayoutChange = () => {
            // Instantly hide the drawer when layout mode transitions
            setIsReady(false);
            setIsOpen(false);
            clearTimeout(resizeTimer);
            // Re-render and slide out smoothly once layout has settled
            resizeTimer = setTimeout(() => {
                setIsReady(true);
            }, 500);
        };

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleLayoutChange);
        } else {
            mediaQuery.addListener(handleLayoutChange);
        }

        return () => {
            clearTimeout(timer);
            clearTimeout(resizeTimer);
            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener('change', handleLayoutChange);
            } else {
                mediaQuery.removeListener(handleLayoutChange);
            }
        };
    }, []);

    if (!isReady) {
        return null;
    }

    return (
        <div className={`modal-jog-drawer-wrapper ${isOpen ? 'open' : 'closed'}`}>
            {/* Slide-out Drawer Panel */}
            <div className="modal-jog-drawer-panel">
                {/* Docked Slide-out Tab Button (rides on drawer edge) */}
                <button
                    type="button"
                    className={`modal-jog-tab-btn ${isOpen ? 'active' : ''}`}
                    onClick={() => setIsOpen((prev) => !prev)}
                    disabled={disabled}
                    title={isOpen ? 'Collapse Jog Controls' : 'Expand Jog Controls'}
                >
                    <div className="modal-jog-tab-chevron">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            {isOpen ? (
                                <polyline points="15 18 9 12 15 6" />
                            ) : (
                                <polyline points="9 18 15 12 9 6" />
                            )}
                        </svg>
                    </div>
                    <span className="modal-jog-tab-text">Jog Controls</span>
                </button>

                <div className="modal-jog-drawer-header">
                    <div className="modal-jog-drawer-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                            <line x1="6" y1="12" x2="10" y2="12"></line>
                            <line x1="8" y1="10" x2="8" y2="14"></line>
                            <circle cx="15" cy="11" r="1"></circle>
                            <circle cx="18" cy="13" r="1"></circle>
                        </svg>
                        <span>Jog Controls</span>
                    </div>
                </div>
                <div className="modal-jog-drawer-content">
                    <Jogging hideRotary={true} />
                </div>
            </div>
        </div>
    );
};

export default ModalJogDrawer;
