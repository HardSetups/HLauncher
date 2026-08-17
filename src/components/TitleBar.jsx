import { useState } from 'react';
import { X, Minus } from 'lucide-react';

function WindowButton({ onClick, danger, children }) {
    const [hover, setHover] = useState(false);
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                width: '40px', height: '28px', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: hover ? (danger ? '#e81123' : 'rgba(255,255,255,0.1)') : 'none',
                color: hover && danger ? '#fff' : 'rgba(255,255,255,0.75)',
                transition: 'background 0.15s, color 0.15s',
            }}
        >
            {children}
        </button>
    );
}

const TitleBar = () => {
    return (
        <div style={{
            height: '36px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 8px 0 14px',
            background: 'rgba(10, 10, 12, 0.55)',
            backdropFilter: 'blur(12px)',
            WebkitAppRegion: 'drag',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src="logo.png" alt="" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.5px' }}>
                    HARDSETUPS LAUNCHER
                </span>
            </div>
            <div style={{ display: 'flex', gap: '2px', WebkitAppRegion: 'no-drag' }}>
                <WindowButton onClick={() => window.electronAPI.minimizeApp()}>
                    <Minus size={15} />
                </WindowButton>
                <WindowButton danger onClick={() => window.electronAPI.closeApp()}>
                    <X size={15} />
                </WindowButton>
            </div>
        </div>
    );
};

export default TitleBar;
