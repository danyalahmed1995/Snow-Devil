
import type { FlowItem } from '../../types/flow';
import './FlowCard.css';

interface FlowCardProps {
  item: FlowItem;
  isSelected?: boolean;
  onClick?: () => void;
  variant?: 'preview' | 'workbench';
}

export function FlowCard({ item, isSelected, onClick, variant = 'workbench' }: FlowCardProps) {
  const isPR = item.type === 'pull_request';
  const variantClass = variant === 'preview' ? 'home-flow-preview-card' : 'flow-workbench-card';
  
  return (
    <div 
      className={`flow-card ${variantClass} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="flow-card-header">
        <span className="flow-card-repo">{item.repositoryName}</span>
        {item.type !== 'release' && typeof item.number === 'number' && item.number > 0 && (
          <span className="flow-card-number">#{item.number}</span>
        )}
      </div>
      
      <div className="flow-card-title" title={item.title}>{item.title}</div>
      
      <div className="flow-card-footer">
        {item.author && (
          <div className="flow-card-author" title={`Author: ${item.author.login}`}>
            {item.author.avatarUrl ? (
              <img src={item.author.avatarUrl} alt={item.author.login} className="avatar-small" />
            ) : null}
            <span className="flow-card-author-name">{item.author.login}</span>
          </div>
        )}
        <div className="flow-card-badges">
          {item.type === 'release' && item.tagName && (
            <span className="badge" style={{ backgroundColor: 'var(--accent-secondary)' }} title="Tag Name">
              🏷️ {item.tagName}
            </span>
          )}
          {item.type === 'release' && item.isPrerelease && (
            <span className="badge" style={{ backgroundColor: 'var(--warning-color)' }} title="Pre-release">
              Pre-release
            </span>
          )}
          {isPR && item.reviewSummary && item.reviewSummary.state !== 'NONE' && (
            <span className={`badge badge-review badge-${item.reviewSummary.state.toLowerCase()}`} title={`Review: ${item.reviewSummary.state}`}>
              {item.reviewSummary.state === 'APPROVED' ? '✓ Approved' : 
               item.reviewSummary.state === 'CHANGES_REQUESTED' ? '❌ Changes Req' : 
               item.reviewSummary.state === 'REVIEW_REQUIRED' ? '👁️ Review Req' : '👁️ Review'}
            </span>
          )}
          {isPR && item.checksSummary && item.checksSummary.state !== 'MISSING' && (
            <span className={`badge badge-checks badge-${item.checksSummary.state.toLowerCase()}`} title={`Checks: ${item.checksSummary.state}`}>
              {item.checksSummary.state === 'SUCCESS' ? '✅ Checks' : 
               item.checksSummary.state === 'FAILURE' ? '❌ Failed' : '⏳ Running'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
