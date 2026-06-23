import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ExternalLink, Files, GitPullRequest, Rows3 } from 'lucide-react';
import { useModeStore } from '../../stores/mode-store';
import { useTabsStore } from '../../stores/tabs-store';
import { demoPullRequest } from '../../repository/demo-repository';
import { parseUnifiedDiff } from '../../diff/diff-utils';
import './PullRequestDiff.css';

export function PullRequestDiff({ repository, number }: { repository: string; number: number }) {
  const mode = useModeStore(s => s.mode);
  const [owner, name] = repository.split('/');
  const [data, setData] = useState<typeof demoPullRequest>();
  const [error, setError] = useState<string>();
  const [layout, setLayout] = useState<'unified' | 'split'>('unified');
  const [activePath, setActivePath] = useState('');

  useEffect(() => {
    setData(undefined); setError(undefined);
    (mode === 'demo' ? Promise.resolve(demoPullRequest) : invoke<typeof demoPullRequest>('get_pr_details', { owner, name, number }))
      .then(setData).catch(cause => setError(String(cause)));
  }, [mode, name, number, owner]);

  const files = useMemo(() => parseUnifiedDiff(data?.diff ?? ''), [data?.diff]);
  const visible = activePath ? files.filter(file => file.newPath === activePath) : files;
  const openGithub = () => useTabsStore.getState().openBrowserTab(`github:pr:${repository}:${number}`, 'pullRequest', `PR #${number}`, `https://github.com/${repository}/pull/${number}`, false, true);

  return <div className="native-diff">
    <header className="native-diff__header"><div><span>Native pull request diff</span><h1><GitPullRequest size={18}/>{data?.title ?? `Pull request #${number}`}</h1><p>{repository} #{number}{data ? ` · ${data.state} · ${data.author?.login}` : ''}</p></div><div className="native-diff__actions"><div role="group" aria-label="Diff layout"><button className={layout === 'unified' ? 'is-active' : ''} onClick={() => setLayout('unified')}><Rows3 size={14}/>Unified</button><button className={layout === 'split' ? 'is-active' : ''} onClick={() => setLayout('split')}><Files size={14}/>Split</button></div><button onClick={openGithub}><ExternalLink size={14}/>Open on GitHub</button></div></header>
    {error && <div className="diff-state"><strong>Unable to load this diff</strong><span>{error}</span></div>}
    {!data && !error && <div className="diff-state">Loading pull request changes...</div>}
    {data && <div className="native-diff__body"><aside aria-label="Changed files"><header><strong>{files.length} changed files</strong><button onClick={() => setActivePath('')}>All files</button></header>{files.map(file => <button className={file.newPath === activePath ? 'is-active' : ''} key={file.newPath} onClick={() => setActivePath(file.newPath)} title={file.newPath}><span>{file.newPath}</span><small><b>+{file.additions}</b> <i>-{file.deletions}</i></small></button>)}</aside><main>{visible.length === 0 ? <div className="diff-state">No textual changes are available.</div> : visible.map(file => <section className="diff-file" key={file.newPath}><header><strong>{file.newPath}</strong><span><b>+{file.additions}</b> <i>-{file.deletions}</i></span></header>{layout === 'unified' ? <table className="diff-unified"><tbody>{file.lines.map((line,index) => <tr className={`is-${line.kind}`} key={index}><td>{line.oldNumber ?? ''}</td><td>{line.newNumber ?? ''}</td><td><code>{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}{line.text}</code></td></tr>)}</tbody></table> : <table className="diff-split"><tbody>{splitRows(file.lines).map((row,index) => <tr key={index}><td className={row.left?.kind ? `is-${row.left.kind}` : ''}><span>{row.left?.oldNumber ?? ''}</span><code>{row.left?.text ?? ''}</code></td><td className={row.right?.kind ? `is-${row.right.kind}` : ''}><span>{row.right?.newNumber ?? ''}</span><code>{row.right?.text ?? ''}</code></td></tr>)}</tbody></table>}</section>)}</main></div>}
  </div>;
}

function splitRows(lines: ReturnType<typeof parseUnifiedDiff>[number]['lines']) {
  const rows: Array<{ left?: typeof lines[number]; right?: typeof lines[number] }> = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.kind === 'remove') {
      const next = lines[index + 1];
      if (next?.kind === 'add') { rows.push({ left: line, right: next }); index++; } else rows.push({ left: line });
    } else if (line.kind === 'add') rows.push({ right: line });
    else rows.push({ left: line, right: line });
  }
  return rows;
}
