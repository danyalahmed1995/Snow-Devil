export interface DiffLine { kind:'context'|'add'|'remove'|'meta'; text:string; oldNumber?:number; newNumber?:number; collapsedCount?:number }
export interface DiffFile {
  oldPath:string; newPath:string; lines:DiffLine[]; additions:number; deletions:number;
  status:'modified'|'added'|'deleted'|'renamed'|'copied'|'binary';
  similarity?:number; binary:boolean; generated:boolean; vendored:boolean;
}

const generatedPatterns=[/(^|\/)dist\//i,/(^|\/)build\//i,/\.min\.(js|css)$/i,/package-lock\.json$|pnpm-lock\.yaml$|yarn\.lock$/i];
const vendoredPatterns=[/(^|\/)vendor\//i,/(^|\/)third[_-]?party\//i,/(^|\/)node_modules\//i];

export function classifyDiffPath(path:string){return{generated:generatedPatterns.some(pattern=>pattern.test(path)),vendored:vendoredPatterns.some(pattern=>pattern.test(path))};}

export function parseUnifiedDiff(diff:string):DiffFile[]{
  const files:DiffFile[]=[];let current:DiffFile|undefined;let oldNumber=0;let newNumber=0;
  for(const text of diff.split(/\r?\n/)){
    if(text.startsWith('diff --git ')){
      const match=/^diff --git a\/(.+) b\/(.+)$/.exec(text);const oldPath=match?.[1]??'';const newPath=match?.[2]??'';const flags=classifyDiffPath(newPath);
      current={oldPath,newPath,lines:[],additions:0,deletions:0,status:'modified',similarity:undefined,binary:false,...flags};files.push(current);
    }else if(current&&text.startsWith('new file mode ')){current.status='added';current.lines.push({kind:'meta',text});
    }else if(current&&text.startsWith('deleted file mode ')){current.status='deleted';current.lines.push({kind:'meta',text});
    }else if(current&&text.startsWith('similarity index ')){current.similarity=Number(text.match(/(\d+)%/)?.[1]);current.lines.push({kind:'meta',text});
    }else if(current&&text.startsWith('rename from ')){current.oldPath=text.slice(12);current.status='renamed';current.lines.push({kind:'meta',text});
    }else if(current&&text.startsWith('rename to ')){current.newPath=text.slice(10);current.status='renamed';current.lines.push({kind:'meta',text});
    }else if(current&&text.startsWith('copy from ')){current.oldPath=text.slice(10);current.status='copied';current.lines.push({kind:'meta',text});
    }else if(current&&text.startsWith('copy to ')){current.newPath=text.slice(8);current.status='copied';current.lines.push({kind:'meta',text});
    }else if(current&&(text.startsWith('Binary files ')||text.startsWith('GIT binary patch'))){current.binary=true;current.status='binary';current.lines.push({kind:'meta',text:'Binary content is not included in this patch.'});
    }else if(current&&text.startsWith('@@')){const hunk=/-(\d+)(?:,\d+)? \+(\d+)/.exec(text);oldNumber=Number(hunk?.[1]??0);newNumber=Number(hunk?.[2]??0);current.lines.push({kind:'meta',text});
    }else if(current&&text.startsWith('+')&&!text.startsWith('+++')){current.lines.push({kind:'add',text:text.slice(1),newNumber:newNumber++});current.additions++;
    }else if(current&&text.startsWith('-')&&!text.startsWith('---')){current.lines.push({kind:'remove',text:text.slice(1),oldNumber:oldNumber++});current.deletions++;
    }else if(current&&!text.startsWith('index ')&&!text.startsWith('---')&&!text.startsWith('+++')&&text!==''&&!current.binary){current.lines.push({kind:'context',text:text.startsWith(' ')?text.slice(1):text,oldNumber:oldNumber++,newNumber:newNumber++});}
  }return files;
}

export function collapseUnchanged(lines:DiffLine[],expanded=false):DiffLine[]{
  if(expanded)return lines;const output:DiffLine[]=[];
  for(let index=0;index<lines.length;){if(lines[index].kind!=='context'){output.push(lines[index++]);continue;}let end=index;while(end<lines.length&&lines[end].kind==='context')end++;const run=lines.slice(index,end);if(run.length>8)output.push(...run.slice(0,3),{kind:'meta',text:`${run.length-6} unchanged lines`,collapsedCount:run.length-6},...run.slice(-3));else output.push(...run);index=end;}return output;
}

export function isWhitespaceOnlyChange(line:DiffLine,neighbor?:DiffLine){return(line.kind==='add'&&neighbor?.kind==='remove'||line.kind==='remove'&&neighbor?.kind==='add')&&line.text.replace(/\s/g,'')===neighbor?.text.replace(/\s/g,'');}

export interface SyntaxPart { text:string; kind?:'keyword'|'string'|'number'|'comment' }
export function syntaxParts(text:string,path:string):SyntaxPart[]{
  const extension=path.split('.').pop()?.toLowerCase();if(!['ts','tsx','js','jsx','rs','py','json','css','html','md','mdx'].includes(extension??''))return[{text}];
  const pattern=/(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|class|interface|type|import|export|from|async|await|pub|fn|struct|impl|use|match|def|True|False|null|undefined)\b|\b\d+(?:\.\d+)?\b)/gm;const parts:SyntaxPart[]=[];let offset=0;
  for(const match of text.matchAll(pattern)){if(match.index!>offset)parts.push({text:text.slice(offset,match.index)});const value=match[0];parts.push({text:value,kind:value.startsWith('//')||value.startsWith('#')?'comment':value.startsWith('"')||value.startsWith("'")?'string':/^\d/.test(value)?'number':'keyword'});offset=match.index!+value.length;}if(offset<text.length)parts.push({text:text.slice(offset)});return parts;
}
