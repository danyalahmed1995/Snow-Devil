import { Info, X } from 'lucide-react';
import './AboutModal.css';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { openUrl } from '@tauri-apps/plugin-opener';

export function AboutModal({ onClose }: { onClose: () => void }) {
  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOpenLink = async (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    e.preventDefault();
    try {
      await openUrl(url);
    } catch (err) {
      console.error('Failed to open url', err);
      window.open(url, '_blank');
    }
  };

  return createPortal(
    <div className="about-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="about-title">
      <div className="about-modal" onClick={e => e.stopPropagation()}>
        <button className="about-modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className="about-modal-header">
          <div className="about-modal-icon-wrapper">
            <img src="/icon.svg" alt="Snow Devil Logo" />
          </div>
          <h2 id="about-title">About Snow Devil</h2>
          <p>A native desktop GitHub workbench</p>
        </div>
        <div className="about-modal-content">
          <a href="https://github.com/danyalahmed1995" target="_blank" rel="noreferrer" className="about-link-card" onClick={(e) => handleOpenLink(e, 'https://github.com/danyalahmed1995')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <div className="about-link-text">
              <h3>GitHub Profile</h3>
              <span>danyalahmed1995</span>
            </div>
          </a>
          <a href="https://github.com/danyalahmed1995/Snow-Devil" target="_blank" rel="noreferrer" className="about-link-card snow-devil-card" onClick={(e) => handleOpenLink(e, 'https://github.com/danyalahmed1995/Snow-Devil')}>
            <img src="/icon.svg" alt="Snow Devil Logo" />
            <div className="about-link-text">
              <h3>Snow Devil Repository</h3>
              <span>View source code</span>
            </div>
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
