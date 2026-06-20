import { WorkspaceTabStrip } from './WorkspaceTabStrip';
import { WorkspaceContent } from './WorkspaceContent';
import './Workspace.css';

export function Workspace() {
  return (
    <div className="workspace">
      <WorkspaceTabStrip />
      <WorkspaceContent />
    </div>
  );
}
