import { useAuthStore } from '../../stores/auth-store';
import { ExternalLink, Globe } from 'lucide-react';
import './AuthModal.css';
import { useEffect } from 'react';
import { useOverlayStore } from '../../stores/overlay-store';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const overlayId = 'auth-modal';
  const openOverlay = useOverlayStore(state => state.openOverlay);
  const closeOverlay = useOverlayStore(state => state.closeOverlay);
  const activeOverlayId = useOverlayStore(state => state.activeOverlayId);
  const { isConnecting, userCode, verificationUri, startDeviceFlow, manualPoll, pollError, isAuthenticated, clientId, setClientId } = useAuthStore();
  useEffect(() => { openOverlay(overlayId); return () => closeOverlay(overlayId); }, [openOverlay, closeOverlay]);
  useEffect(() => {
    if (activeOverlayId && activeOverlayId !== overlayId) onClose();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [activeOverlayId, onClose]);

  if (isAuthenticated) {
    return (
      <div className="modal-overlay">
        <div className="modal-content glass-panel">
          <h2>Connected!</h2>
          <p>Your GitHub account is connected.</p>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        <div className="modal-header">
          <Globe size={32} />
          <h2>Connect GitHub</h2>
        </div>
        
        {!isConnecting ? (
          <div className="modal-body">
            <p style={{ fontSize: '14px', marginBottom: '16px' }}>
              To connect, you need a GitHub OAuth App Client ID with Device Flow enabled.
              <br/><br/>
              1. Go to <strong>GitHub Settings &gt; Developer settings &gt; OAuth Apps</strong><br/>
              2. Click <strong>New OAuth App</strong><br/>
              3. Check <strong>Enable Device Flow</strong><br/>
              4. Copy the Client ID below:
            </p>
            <div className="input-group" style={{ marginBottom: '20px' }}>
              <input 
                type="text" 
                placeholder="Client ID (e.g. Iv1.xxx)" 
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                style={{ width: '100%', padding: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '4px' }}
              />
            </div>
            {pollError && (
              <div style={{ color: 'var(--error)', fontSize: '13px', marginBottom: '16px', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', padding: '8px', borderRadius: '4px' }}>
                {pollError}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button 
                className="btn-primary" 
                onClick={startDeviceFlow}
                disabled={!clientId.trim()}
              >
                Connect with GitHub
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            {userCode ? (
              <div className="device-flow-steps">
                <ol>
                  <li>
                    <span>Open </span>
                    <a href={verificationUri!} target="_blank" rel="noreferrer" className="open-link">
                      {verificationUri} <ExternalLink size={14} />
                    </a>
                  </li>
                  <li>Enter the code below:</li>
                </ol>
                <div className="code-display-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div className="code-display" style={{ marginBottom: 0, flex: 1 }}>{userCode}</div>
                  <button 
                    className="btn-secondary" 
                    title="Copy to clipboard"
                    onClick={() => {
                      navigator.clipboard.writeText(userCode || '');
                      const btn = document.getElementById('copy-code-btn');
                      if (btn) {
                        btn.innerText = 'Copied!';
                        setTimeout(() => btn.innerText = 'Copy', 2000);
                      }
                    }}
                    id="copy-code-btn"
                    style={{ padding: '12px 16px', height: '100%', fontSize: '14px' }}
                  >
                    Copy
                  </button>
                </div>
                <p className="waiting-text">Waiting for authorization...</p>
                {pollError && (
                  <div style={{ color: 'var(--error)', fontSize: '13px', marginBottom: '16px', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', padding: '8px', borderRadius: '4px' }}>
                    {pollError}
                  </div>
                )}
                <div className="modal-actions" style={{ marginTop: '20px' }}>
                  <button className="btn-secondary" onClick={() => {
                     useAuthStore.setState({ isConnecting: false });
                  }}>Cancel</button>
                  <button className="btn-primary" onClick={manualPoll}>
                    Check Status
                  </button>
                </div>
              </div>
            ) : (
              <p>Starting connection...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
