import { useAuthStore } from '../../stores/auth-store';
import { ExternalLink, Globe, CheckCircle2, Loader2, Key, X } from 'lucide-react';
import './AuthModal.css';
import { useEffect, useState } from 'react';
import { useOverlayStore } from '../../stores/overlay-store';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const overlayId = 'auth-modal';
  const openOverlay = useOverlayStore(state => state.openOverlay);
  const closeOverlay = useOverlayStore(state => state.closeOverlay);
  const activeOverlayId = useOverlayStore(state => state.activeOverlayId);
  
  const { isConnecting, userCode, verificationUri, startDeviceFlow, pollError, isAuthenticated, clientId, setClientId, session } = useAuthStore();
  
  const [successClosing, setSuccessClosing] = useState(false);
  const [inputValue, setInputValue] = useState(clientId);

  useEffect(() => { 
    openOverlay(overlayId); 
    return () => {
      closeOverlay(overlayId);
      if (useAuthStore.getState().isConnecting) {
        useAuthStore.setState({ isConnecting: false });
      }
    };
  }, [openOverlay, closeOverlay]);
  
  const handleCancel = () => {
    useAuthStore.setState({ isConnecting: false });
    onClose();
  };

  useEffect(() => {
    if (activeOverlayId && activeOverlayId !== overlayId) onClose();
    const key = (event: KeyboardEvent) => { 
      if (event.key === 'Escape') { 
        event.preventDefault(); 
        handleCancel();
      } 
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [activeOverlayId, onClose]);

  useEffect(() => {
    if (isAuthenticated && !successClosing) {
      setSuccessClosing(true);
      const timer = setTimeout(() => {
        onClose();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, successClosing, onClose]);

  const handleConnect = () => {
    setClientId(inputValue);
    startDeviceFlow();
  };

  const getStage = () => {
    if (isAuthenticated) return 'success';
    if (isConnecting && userCode) return 'device-flow';
    if (isConnecting) return 'starting';
    return 'client-id';
  };

  const stage = getStage();

  return (
    <div className="modal-overlay auth-modal-overlay">
      <div className="modal-content auth-modal-content glass-panel" data-stage={stage}>
        {stage === 'success' ? (
          <div className="auth-stage auth-success">
            <div className="success-icon-wrapper">
              <CheckCircle2 size={56} className="success-icon" />
            </div>
            <h2>Connected to GitHub</h2>
            {session.status === 'connected' && session.account ? (
              <div className="connected-account">
                {session.account.avatarUrl && <img src={session.account.avatarUrl} alt="" className="avatar" />}
                <div className="account-details">
                  <strong>{session.account.name || session.account.login}</strong>
                  <span>@{session.account.login}</span>
                </div>
              </div>
            ) : null}
            <p className="preparation-text">Preparing your Snow Devil workspace…</p>
          </div>
        ) : stage === 'device-flow' ? (
          <div className="auth-stage auth-device">
            <button className="modal-close-btn" onClick={handleCancel} aria-label="Cancel">
              <X size={20} />
            </button>
            <div className="modal-header">
              <Key size={24} className="header-icon" aria-hidden="true" />
              <h2>Authorize Snow Devil</h2>
            </div>
            
            <div className="device-progress" aria-label="Authorization progress">
              <div className="step done" aria-current="false">Connect</div>
              <div className="step active" aria-current="step">Authorize</div>
              <div className="step" aria-current="false">Prepare</div>
            </div>

            <div className="device-flow-body">
              <p className="step-label">1. Open GitHub</p>
              <a href={verificationUri!} target="_blank" rel="noreferrer" className="open-github-btn">
                <span>{verificationUri}</span> <ExternalLink size={14} />
              </a>
              
              <p className="step-label">2. Enter this code</p>
              <div className="code-display-wrapper">
                <div className="code-display">{userCode}</div>
                <button 
                  className="btn-secondary copy-btn"
                  onClick={(e) => {
                    navigator.clipboard.writeText(userCode || '');
                    const btn = e.currentTarget;
                    btn.innerText = 'Copied!';
                    setTimeout(() => btn.innerText = 'Copy', 2000);
                  }}
                >
                  Copy
                </button>
              </div>

              <div className="auth-status">
                <Loader2 size={16} className="spinner" />
                <span>Waiting for GitHub authorization</span>
              </div>
              
              {pollError && (
                <div className="poll-error">
                  {pollError}
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ paddingTop: '8px' }}>
              {/* Cancel button removed, X button at top right handles cancellation */}
            </div>
          </div>
        ) : (
          <div className="auth-stage auth-client">
            <button className="modal-close-btn" onClick={handleCancel} aria-label="Cancel">
              <X size={20} />
            </button>
            <div className="modal-header">
              <Globe size={24} className="header-icon" aria-hidden="true" />
              <h2>Connect GitHub</h2>
            </div>
            
            <div className="modal-body">
              <p className="auth-description">
                To connect, you need a GitHub OAuth App Client ID with Device Flow enabled.
              </p>
              <div className="auth-instructions">
                1. Go to <strong>GitHub Settings &gt; Developer settings &gt; OAuth Apps</strong><br/>
                2. Click <strong>New OAuth App</strong><br/>
                3. Check <strong>Enable Device Flow</strong><br/>
                4. Copy the Client ID below:
              </div>
              <div className="input-group">
                <input 
                  type="text" 
                  aria-label="GitHub OAuth Client ID"
                  placeholder="Client ID (e.g. Iv1.xxx)" 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && inputValue.trim()) handleConnect(); }}
                  className="client-id-input"
                  autoFocus
                />
              </div>
              {pollError && <div className="poll-error">{pollError}</div>}
              
              <div className="modal-actions">
                <button 
                  className="btn-primary connect-btn" 
                  onClick={handleConnect}
                  disabled={!inputValue.trim() || stage === 'starting'}
                >
                  {stage === 'starting' ? <><Loader2 size={14} className="spinner" /> Connecting</> : 'Connect with GitHub'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
