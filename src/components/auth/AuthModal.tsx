import { useAuthStore } from '../../stores/auth-store';
import { ExternalLink, Globe, Loader2, Key, X, RefreshCw, Circle, CheckCircle2, XCircle } from 'lucide-react';
import './AuthModal.css';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useOverlayStore } from '../../stores/overlay-store';

type TimelineStep = {
  label: string;
  detail?: string;
  status: 'done' | 'active' | 'pending' | 'failed';
  timestamp?: number;
};

function ConnectionTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="auth-timeline">
      {steps.map((step, i) => (
        <div key={i} className={`auth-timeline-step auth-timeline-step--${step.status}`}>
          <div className="auth-timeline-marker">
            {step.status === 'done' ? <CheckCircle2 size={16} /> :
             step.status === 'active' ? <Loader2 size={16} className="spinner" /> :
             step.status === 'failed' ? <XCircle size={16} /> :
             <Circle size={16} />}
          </div>
          <div className="auth-timeline-content">
            <span className="auth-timeline-label">{step.label}</span>
            {step.detail && <span className="auth-timeline-detail">{step.detail}</span>}
            {step.timestamp && <span className="auth-timeline-time">{new Date(step.timestamp).toLocaleTimeString()}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AuthModal({ onClose }: { onClose: () => void }) {
  const overlayId = 'auth-modal';
  const openOverlay = useOverlayStore(state => state.openOverlay);
  const closeOverlay = useOverlayStore(state => state.closeOverlay);
  const activeOverlayId = useOverlayStore(state => state.activeOverlayId);
  
  const { isConnecting, userCode, verificationUri, startDeviceFlow, pollError, isAuthenticated, clientId, setClientId, session, manualPoll } = useAuthStore();
  
  const [successClosing, setSuccessClosing] = useState(false);
  const [inputValue, setInputValue] = useState(clientId);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [authStartedAt, setAuthStartedAt] = useState<number | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { 
    openOverlay(overlayId); 
    return () => {
      closeOverlay(overlayId);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [openOverlay, closeOverlay]);
  
  const handleCancel = useCallback(() => {
    useAuthStore.setState({ isConnecting: false });
    onClose();
  }, [onClose]);

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
  }, [activeOverlayId, onClose, handleCancel]);

  // Track when auth started
  useEffect(() => {
    if (isConnecting && !authStartedAt) {
      setAuthStartedAt(Date.now());
    }
    if (!isConnecting && !isAuthenticated) {
      setAuthStartedAt(null);
    }
  }, [isConnecting, isAuthenticated, authStartedAt]);

  // Auto-close on success with visibility awareness
  useEffect(() => {
    if (isAuthenticated && !successClosing) {
      setConnectedAt(Date.now());
      setSuccessClosing(true);
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 2500);
    }
  }, [isAuthenticated, successClosing, onClose]);

  // Fix stuck panel: if we come back from background while already authenticated, close immediately
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isAuthenticated && successClosing) {
        // Give a brief moment for paint, then close
        closeTimerRef.current = setTimeout(() => {
          onClose();
        }, 400);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAuthenticated, successClosing, onClose]);

  const handleConnect = () => {
    setClientId(inputValue);
    setAuthStartedAt(Date.now());
    startDeviceFlow();
  };

  const handleRetry = () => {
    useAuthStore.setState({ pollError: null });
    manualPoll();
  };

  const getStage = () => {
    if (isAuthenticated) return 'success';
    if (pollError && !isConnecting) return 'failed';
    if (isConnecting && userCode) return 'device-flow';
    if (isConnecting) return 'starting';
    return 'client-id';
  };

  const stage = getStage();

  const buildTimelineSteps = (): TimelineStep[] => {
    const steps: TimelineStep[] = [];
    
    if (stage === 'success') {
      steps.push({ label: 'Authenticated with GitHub', status: 'done', timestamp: authStartedAt ?? undefined });
      steps.push({ 
        label: `Connected as ${session.status === 'connected' ? `@${session.account.login}` : 'user'}`, 
        status: 'done', 
        timestamp: connectedAt ?? undefined 
      });
      steps.push({ label: 'Preparing workspace', status: 'active', detail: 'Loading repositories, issues, and pull requests' });
    } else if (stage === 'failed') {
      steps.push({ label: 'Authenticating with GitHub', status: 'done', timestamp: authStartedAt ?? undefined });
      steps.push({ label: 'Connection failed', status: 'failed', detail: pollError ?? 'An unknown error occurred' });
      steps.push({ label: 'Preparing workspace', status: 'pending' });
    } else if (stage === 'device-flow') {
      steps.push({ label: 'Device flow initiated', status: 'done', timestamp: authStartedAt ?? undefined });
      steps.push({ label: 'Waiting for authorization', status: 'active', detail: 'Authorize Snow Devil on GitHub' });
      steps.push({ label: 'Preparing workspace', status: 'pending' });
    } else if (stage === 'starting') {
      steps.push({ label: 'Connecting to GitHub', status: 'active' });
      steps.push({ label: 'Authorize', status: 'pending' });
      steps.push({ label: 'Preparing workspace', status: 'pending' });
    }
    
    return steps;
  };

  return (
    <div className="modal-overlay auth-modal-overlay">
      <div className="modal-content auth-modal-content glass-panel" data-stage={stage}>
        {stage === 'success' ? (
          <div className="auth-stage auth-success">
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
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
            <div className="auth-timeline-section">
              <ConnectionTimeline steps={buildTimelineSteps()} />
            </div>
          </div>
        ) : stage === 'failed' ? (
          <div className="auth-stage auth-failed">
            <button className="modal-close-btn" onClick={handleCancel} aria-label="Close">
              <X size={20} />
            </button>
            <div className="modal-header">
              <XCircle size={24} className="header-icon header-icon--error" aria-hidden="true" />
              <h2>Connection Failed</h2>
            </div>
            <div className="auth-timeline-section">
              <ConnectionTimeline steps={buildTimelineSteps()} />
            </div>
            <div className="failure-message">
              <p>{pollError ?? 'An unknown error occurred while connecting to GitHub.'}</p>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={handleCancel}>Cancel</button>
              <button className="btn-primary connect-btn" onClick={handleRetry}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
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
            
            <div className="auth-timeline-section auth-timeline-section--compact">
              <ConnectionTimeline steps={buildTimelineSteps()} />
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
                  <span>{pollError}</span>
                  <button className="btn-secondary poll-error-retry" onClick={handleRetry}>
                    <RefreshCw size={12} /> Retry
                  </button>
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
