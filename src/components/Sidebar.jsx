import { useState } from 'react';
import { motion } from 'framer-motion';
import { Home, Settings, User, Server, MessageCircle, Copy, Check } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab, accent = '#00f2ff', copyText = '' }) => {
    const [copied, setCopied] = useState(false);

    const menuItems = [
        { id: 'dashboard', icon: <Home size={20} />, label: 'Ana Sayfa' },
        { id: 'servers', icon: <Server size={20} />, label: 'Sunucular' },
        { id: 'settings', icon: <Settings size={20} />, label: 'Ayarlar' },
    ];

    const openDiscord = () => {
        window.open('https://discord.com/invite/S4b25eJQtj', '_blank');
    };

    const copyAddress = () => {
        if (!copyText) return;
        navigator.clipboard.writeText(copyText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="sidebar glass-panel" style={{
            width: '80px',
            height: 'calc(100% - 64px)',
            margin: '32px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '24px 0',
            gap: '24px'
        }}>
            <div className="logo" style={{ marginBottom: '16px' }}>
                <img src="logo.png" alt="Logo" style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
            </div>

            {menuItems.map(item => (
                <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    style={{
                        background: activeTab === item.id ? 'rgba(255,255,255,0.1)' : 'none',
                        color: activeTab === item.id ? accent : 'white',
                        padding: '12px',
                        borderRadius: '12px',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    {item.icon}
                    <span style={{ fontSize: '10px' }}>{item.label}</span>
                    {activeTab === item.id && (
                        <motion.div
                            layoutId="sidebar-indicator"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            style={{
                                position: 'absolute',
                                left: '-16px',
                                width: '4px',
                                height: '24px',
                                background: accent,
                                borderRadius: '0 4px 4px 0'
                            }}
                        />
                    )}
                </button>
            ))}

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                    onClick={openDiscord}
                    title="Discord'a Katıl"
                    style={{
                        background: 'rgba(88, 101, 242, 0.2)',
                        color: '#5865F2',
                        padding: '12px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <MessageCircle size={20} />
                </button>

                <button
                    onClick={copyAddress}
                    disabled={!copyText}
                    title={copyText ? `Adresi kopyala: ${copyText}` : 'Kopyalanacak adres yok'}
                    style={{
                        background: copied ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.2)',
                        color: '#10b981',
                        padding: '12px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>

                <button
                    onClick={() => setActiveTab('profile')}
                    style={{
                        background: activeTab === 'profile' ? 'rgba(255,255,255,0.1)' : 'none',
                        color: activeTab === 'profile' ? accent : 'white',
                        padding: '12px',
                        borderRadius: '12px'
                    }}
                >
                    <User size={20} />
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
