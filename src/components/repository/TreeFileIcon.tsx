import { Binary, Braces, File, FileCode2, FileImage, FileJson, FileKey2, FileText, Folder, FolderGit2, FolderOpen, Hash } from 'lucide-react';

export function TreeFileIcon({path,type,open=false}:{path:string;type:'tree'|'blob';open?:boolean}){
  const name=path.split('/').pop()?.toLowerCase()??'';const ext=name.split('.').pop()??'';
  if(type==='tree')return open?<FolderOpen size={15}/>:name==='.git'||name==='.github'?<FolderGit2 size={15}/>:<Folder size={15}/>;
  if(['png','jpg','jpeg','svg','webp'].includes(ext))return <FileImage size={15}/>;
  if(['ts','tsx','js','jsx','rs','py','sh','bash','html','css'].includes(ext))return <FileCode2 size={15}/>;
  if(['json','yaml','yml','toml'].includes(ext))return ext==='json'?<FileJson size={15}/>:<Braces size={15}/>;
  if(['md','mdx','txt'].includes(ext))return <FileText size={15}/>;
  if(name.includes('lock')||name.endsWith('.lock'))return <FileKey2 size={15}/>;
  if(name.startsWith('.git'))return <Hash size={15}/>;
  if(['zip','gz','7z','exe','dll','wasm','pdf'].includes(ext))return <Binary size={15}/>;
  return ext?<File size={15}/>:<FileText size={15}/>;
}
