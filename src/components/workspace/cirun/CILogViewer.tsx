import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import './CILogViewer.css';

export interface LogLineData {
  lineNumber: number;
  text: string;
}

interface LogNode {
  type: 'line' | 'group';
  lineData?: LogLineData;
  groupTitle?: string;
  groupStartLineNumber?: number;
  children?: LogNode[];
}

function parseAnsi(rawText: string) {
  let text = rawText;
  let isCommand = false;
  let isError = false;
  let isWarning = false;
  
  // Handle GitHub Actions specific markers
  if (text.startsWith('[command]')) {
    text = text.substring(9);
    isCommand = true;
  } else if (text.startsWith('##[error]')) {
    text = text.substring(9);
    isError = true;
  } else if (text.startsWith('##[warning]')) {
    text = text.substring(11);
    isWarning = true;
  }

  // Simple ANSI parser to React elements
  const ansiRegex = new RegExp('\\x' + '1b' + '\\[([0-9;]*)[a-zA-Z]', 'g');
  let match;
  let lastIndex = 0;
  const parts: React.ReactNode[] = [];
  
  const currentClasses = new Set<string>();
  if (isCommand) currentClasses.add('ansi-fg-34'); // Blue for commands
  if (isError) currentClasses.add('ansi-fg-31'); // Red for errors
  if (isWarning) currentClasses.add('ansi-fg-33'); // Yellow for warnings

  const pushPart = (content: string, index: number) => {
    if (!content) return;
    if (currentClasses.size === 0) {
      parts.push(<span key={index}>{content}</span>);
    } else {
      parts.push(<span key={index} className={Array.from(currentClasses).join(' ')}>{content}</span>);
    }
  };

  let partIndex = 0;
  while ((match = ansiRegex.exec(text)) !== null) {
    const content = text.slice(lastIndex, match.index);
    pushPart(content, partIndex++);
    
    // Only process SGR (Select Graphic Rendition) codes which end in 'm'
    if (match[0].endsWith('m')) {
      const codes = match[1].split(';').map(c => parseInt(c || '0', 10));
      for (const code of codes) {
        if (code === 0) {
          currentClasses.clear();
          if (isCommand) currentClasses.add('ansi-fg-34');
          if (isError) currentClasses.add('ansi-fg-31');
          if (isWarning) currentClasses.add('ansi-fg-33');
        } else if (code === 1) {
          currentClasses.add('ansi-bold');
        } else if (code >= 30 && code <= 37) {
          for (let i = 30; i <= 37; i++) currentClasses.delete(`ansi-fg-${i}`);
          for (let i = 90; i <= 97; i++) currentClasses.delete(`ansi-fg-${i}`);
          currentClasses.add(`ansi-fg-${code}`);
        } else if (code >= 90 && code <= 97) {
          for (let i = 30; i <= 37; i++) currentClasses.delete(`ansi-fg-${i}`);
          for (let i = 90; i <= 97; i++) currentClasses.delete(`ansi-fg-${i}`);
          currentClasses.add(`ansi-fg-${code}`);
        } else if (code >= 40 && code <= 47) {
          for (let i = 40; i <= 47; i++) currentClasses.delete(`ansi-bg-${i}`);
          for (let i = 100; i <= 107; i++) currentClasses.delete(`ansi-bg-${i}`);
          currentClasses.add(`ansi-bg-${code}`);
        } else if (code >= 100 && code <= 107) {
          for (let i = 40; i <= 47; i++) currentClasses.delete(`ansi-bg-${i}`);
          for (let i = 100; i <= 107; i++) currentClasses.delete(`ansi-bg-${i}`);
          currentClasses.add(`ansi-bg-${code}`);
        }
      }
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  const remaining = text.slice(lastIndex);
  pushPart(remaining, partIndex);
  
  return parts;
}

const LogLineRenderer: React.FC<{ line: LogLineData }> = React.memo(({ line }) => {
  return (
    <div className="ci-log-line">
      <div className="ci-log-lineno">{line.lineNumber}</div>
      <div className="ci-log-content">{parseAnsi(line.text)}</div>
    </div>
  );
});
LogLineRenderer.displayName = 'LogLineRenderer';

const LogGroupRenderer: React.FC<{ node: LogNode }> = React.memo(({ node }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className={`ci-log-group ${expanded ? 'expanded' : ''}`}>
      <div className="ci-log-line ci-log-group-header" onClick={() => setExpanded(!expanded)}>
        <div className="ci-log-lineno">{node.groupStartLineNumber}</div>
        <div className="ci-log-content ci-log-group-title">
          {expanded ? <ChevronDown size={14} className="ci-log-group-chevron" /> : <ChevronRight size={14} className="ci-log-group-chevron" />}
          {parseAnsi(node.groupTitle || '')}
        </div>
      </div>
      {expanded && (
        <div className="ci-log-group-children">
          {node.children?.map((child, idx) => (
            child.type === 'line' ? 
              <LogLineRenderer key={idx} line={child.lineData!} /> : 
              <LogGroupRenderer key={idx} node={child} />
          ))}
        </div>
      )}
    </div>
  );
});
LogGroupRenderer.displayName = 'LogGroupRenderer';

export const CILogViewer: React.FC<{ lines: LogLineData[] }> = ({ lines }) => {
  const rootNodes = useMemo(() => {
    const root: LogNode[] = [];
    const stack: LogNode[] = [];
    
    for (const line of lines) {
      const text = line.text;
      
      if (text.includes('##[group]')) {
        const titleMatch = text.match(/##\[group\](.*)/);
        const title = titleMatch ? titleMatch[1] : 'Group';
        
        const groupNode: LogNode = {
          type: 'group',
          groupTitle: title,
          groupStartLineNumber: line.lineNumber,
          children: []
        };
        
        if (stack.length > 0) {
          stack[stack.length - 1].children!.push(groupNode);
        } else {
          root.push(groupNode);
        }
        stack.push(groupNode);
      } else if (text.includes('##[endgroup]')) {
        if (stack.length > 0) {
          stack.pop();
        } else {
          // Unmatched endgroup, just render as line
          root.push({ type: 'line', lineData: line });
        }
      } else {
        const node: LogNode = { type: 'line', lineData: line };
        if (stack.length > 0) {
          stack[stack.length - 1].children!.push(node);
        } else {
          root.push(node);
        }
      }
    }
    
    return root;
  }, [lines]);

  return (
    <div className="ci-log-viewer-container">
      {rootNodes.map((node, idx) => (
        node.type === 'line' ? 
          <LogLineRenderer key={idx} line={node.lineData!} /> : 
          <LogGroupRenderer key={idx} node={node} />
      ))}
    </div>
  );
};
