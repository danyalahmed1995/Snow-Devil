export const MAX_IMAGE_PREVIEW_BYTES=5_000_000;
const BLOCKED_ELEMENTS=new Set(['script','foreignObject','iframe','object','embed','audio','video','link','style']);

export function sanitizeSvg(source:string):string{
  const documentValue=new DOMParser().parseFromString(source,'image/svg+xml');
  if(documentValue.querySelector('parsererror')||documentValue.documentElement.tagName.toLowerCase()!=='svg')throw new Error('Invalid SVG document');
  for(const element of [...documentValue.querySelectorAll('*')]){
    if(BLOCKED_ELEMENTS.has(element.tagName)) { element.remove(); continue; }
    for(const attribute of [...element.attributes]){
      const name=attribute.name.toLowerCase();const value=attribute.value.trim().toLowerCase();
      if(name.startsWith('on')||name==='srcdoc'||value.startsWith('javascript:')||((name==='href'||name==='xlink:href')&&!value.startsWith('#')&&!value.startsWith('data:image/')))element.removeAttribute(attribute.name);
    }
  }
  return new XMLSerializer().serializeToString(documentValue);
}

export function decodeBase64(value:string){const binary=atob(value);const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return bytes;}

export function createSafeImageUrl(file:{text:string|null;contentBase64?:string;mimeType?:string;path:string}){
  const extension=file.path.split('.').pop()?.toLowerCase();
  if(extension==='svg'){if(!file.text)throw new Error('SVG content is unavailable');return URL.createObjectURL(new Blob([sanitizeSvg(file.text)],{type:'image/svg+xml'}));}
  if(!file.contentBase64)throw new Error('Image bytes are unavailable');
  const mime=file.mimeType??(extension==='png'?'image/png':'image/jpeg');
  if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new Error('Unsupported image content type');
  return URL.createObjectURL(new Blob([decodeBase64(file.contentBase64)],{type:mime}));
}
