
import type { FlowItem } from '../../types/flow';
import { formatTimeInStage } from '../../lib/workflow-presentation';
import './FlowCard.css';

interface FlowCardProps {
  item: FlowItem;
  isSelected?: boolean;
  onClick?: () => void;
  onOpen?: () => void;
  variant?: 'preview' | 'workbench';
}

export function FlowCard({ item, isSelected, onClick, onOpen, variant = 'workbench' }: FlowCardProps) {
  const isPR = item.type === 'pull_request';
  const variantClass = variant === 'preview' ? 'home-flow-preview-card' : 'flow-workbench-card';
  
  return (
    <button
      type="button"
      className={`flow-card ${variantClass} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onOpen}
      onKeyDown={event => { if (event.key === 'Enter' && onOpen) { event.preventDefault(); onOpen(); } }}
      aria-pressed={isSelected}
      aria-label={`${item.type === 'pull_request' ? 'Pull request' : item.type} ${item.number ? `#${item.number} ` : ''}${item.title}`}
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
          {item.isDraft && <span className="badge badge-neutral">Draft</span>}
          {item.isBot && <span className="badge badge-neutral">Bot</span>}
          {item.type === 'release' && item.tagName && (
            <span className="badge badge-info" title="Tag Name">
              Tag {item.tagName}
            </span>
          )}
          {item.type === 'release' && item.isPrerelease && (
            <span className="badge badge-warning" title="Pre-release">
              Pre-release
            </span>
          )}
          {isPR && item.reviewSummary && item.reviewSummary.state !== 'NONE' && (
            <span className={`badge badge-review badge-${item.reviewSummary.state.toLowerCase()}`} title={`Review: ${item.reviewSummary.state}`}>
              {item.reviewSummary.state === 'APPROVED' ? 'Approved' :
               item.reviewSummary.state === 'CHANGES_REQUESTED' ? 'Changes Req' :
               item.reviewSummary.state === 'REVIEW_REQUIRED' ? 'Review Req' : 'Review'}
            </span>
          )}
          {isPR && item.checksSummary && item.checksSummary.state !== 'MISSING' && (
            <span className={`badge badge-checks badge-${item.checksSummary.state.toLowerCase()}`} title={`Checks: ${item.checksSummary.state}`}>
              {item.checksSummary.state === 'SUCCESS' ? 'Checks passed' :
               item.checksSummary.state === 'FAILURE' ? 'Checks failed' : 'Checks running'}
            </span>
          )}
        </div>
        <span className="flow-card-age" title={item.stageEnteredAt ? `Entered stage ${new Date(item.stageEnteredAt).toLocaleString()}` : 'Stage entry not reported'}>{formatTimeInStage(item)}</span>
      </div>
    </button>
  );
}
