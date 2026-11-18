import DOMPurify from 'dompurify';
import {
  applyDescriptionLink,formatDescription,normalizeDescriptionUrl,renderDescription,
} from '../lib/description-format';

export type DescriptionMode='edit'|'preview';
export interface DescriptionFieldOptions {
  id?:string;name:string;label:string;value:string;readOnly?:boolean;mode?:DescriptionMode;
  attributes?:Record<string,string>;
}
export interface DescriptionFieldCallbacks {
  onInput?:(value:string,textarea:HTMLTextAreaElement)=>void;
  onCommit?:(value:string,textarea:HTMLTextAreaElement)=>void;
}
type Action='bold'|'italic'|'heading'|'bullet'|'numbered'|'quote'|'code';
type Patch={value:string;selectionStart:number;selectionEnd:number;replaceStart:number;replaceEnd:number;text:string};
type Selection={start:number;end:number};
type FieldState={committed:string;rendered?:string;selection?:Selection;linkSelection?:Selection;inputVersion:number};

let nextId=0;
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,character=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[character]!));
const commands:[Action,string,string][]=[
  ['bold','Bold','<strong aria-hidden="true">B</strong>'],
  ['italic','Italic','<em aria-hidden="true">I</em>'],
  ['heading','Heading','<span aria-hidden="true">H₂</span>'],
  ['bullet','Bulleted list','<span aria-hidden="true">• ≡</span>'],
  ['numbered','Numbered list','<span aria-hidden="true">1.</span>'],
  ['quote','Quote','<span aria-hidden="true">❞</span>'],
  ['code','Inline code','<span aria-hidden="true">&lt;/&gt;</span>'],
];
const linkIcon='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/></svg>';

function previewHtml(value:string){
  if(!value.trim())return '<p class="description-empty">No description yet.</p>';
  // This module is mounted in the browser. A server-side markup call still
  // returns escaped text instead of depending on a server DOM implementation.
  if(typeof DOMPurify.sanitize!=='function')return '<p>'+escape(value).replace(/\n/g,'<br>')+'</p>';
  return DOMPurify.sanitize(renderDescription(value),{
    ALLOWED_TAGS:['p','br','strong','em','s','del','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote','pre','code','a','hr'],
    ALLOWED_ATTR:['href','title','target','rel','start'],
    ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,
  });
}

/** Existing strings remain the form value; formatting only changes that string. */
export function descriptionFieldMarkup(options:DescriptionFieldOptions):string{
  const id=options.id||'orbit-description-field-'+(++nextId),labelId=id+'-label',previewId=id+'-preview';
  const readOnly=Boolean(options.readOnly),mode=readOnly?'preview':options.mode||'edit';
  const attributes=Object.entries(options.attributes||{}).filter(([key])=>/^(data-[a-z0-9-]+|aria-[a-z0-9-]+)$/.test(key)&&!key.startsWith('data-description-'))
    .map(([key,value])=>' '+key+'="'+escape(value)+'"').join('');
  const toolbar=commands.map(([action,label,content],index)=>'<button type="button" class="description-command" data-description-command="'+action+'" tabindex="'+(index===0?'0':'-1')+'" aria-label="'+label+'" title="'+label+(action==='bold'?' (⌘/Ctrl+B)':action==='italic'?' (⌘/Ctrl+I)':'')+'">'+content+'</button>').join('')
    +'<button type="button" class="description-command" data-description-command="link" tabindex="-1" aria-label="Insert link" title="Insert link">'+linkIcon+'</button>';
  return '<div class="field description-field" data-description-field data-description-mode="'+mode+'">'
    +'<div class="description-heading"><label id="'+escape(labelId)+'" for="'+escape(id)+'">'+escape(options.label)+'</label>'
    +(!readOnly?'<div class="description-modes" role="group" aria-label="'+escape(options.label)+' display mode"><button type="button" data-description-mode-button="edit" aria-controls="'+escape(id)+'" aria-pressed="'+String(mode==='edit')+'">Edit</button><button type="button" data-description-mode-button="preview" aria-controls="'+escape(previewId)+'" aria-pressed="'+String(mode==='preview')+'">Preview</button></div>':'')+'</div>'
    +'<div class="description-compose" data-description-compose'+(mode==='preview'?' hidden':'')+'>'
    +'<div class="description-toolbar" role="toolbar" aria-label="'+escape(options.label)+' formatting">'+toolbar+'</div>'
    +'<textarea id="'+escape(id)+'" name="'+escape(options.name)+'" data-description-input rows="4" maxlength="10000" placeholder="Add details…"'+(readOnly?' readonly':'')+attributes+'>'+escape(options.value)+'</textarea></div>'
    +'<div class="description-link-panel" data-description-link-panel role="group" aria-label="Insert description link" hidden>'
    +'<div class="description-link-fields"><div class="field"><label for="'+escape(id+'-link-text')+'">Link text</label><input id="'+escape(id+'-link-text')+'" type="text" maxlength="10000" data-description-link-text disabled></div>'
    +'<div class="field"><label for="'+escape(id+'-link-url')+'">Link URL</label><input id="'+escape(id+'-link-url')+'" type="text" inputmode="url" autocomplete="url" spellcheck="false" maxlength="10000" placeholder="https://example.com" data-description-link-url disabled></div></div>'
    +'<div class="description-link-actions"><button type="button" data-description-link-cancel>Cancel link</button><button type="button" data-description-link-add>Add link</button></div></div>'
    +'<div class="description-preview" id="'+escape(previewId)+'" data-description-preview role="region" tabindex="0" aria-label="'+escape(options.label)+' preview"'+(mode==='edit'?' hidden':'')+'>'+previewHtml(options.value)+'</div>'
    +'<p class="description-error" data-description-error role="alert" hidden></p></div>';
}

/** One delegated binding survives the planner replacing its inner markup. */
export function bindDescriptionFields(root:HTMLElement,callbacks:DescriptionFieldCallbacks={}){
  const states=new WeakMap<HTMLElement,FieldState>();
  const fieldFor=(target:EventTarget|null)=>target instanceof Element?target.closest<HTMLElement>('[data-description-field]'):null;
  const inputFor=(field:HTMLElement)=>field.querySelector<HTMLTextAreaElement>('[data-description-input]')!;
  const stateFor=(field:HTMLElement)=>{
    let state=states.get(field);
    if(!state){state={committed:inputFor(field).value,inputVersion:0};states.set(field,state);}
    return state;
  };
  const error=(field:HTMLElement,message='')=>{
    const notice=field.querySelector<HTMLElement>('[data-description-error]')!;
    notice.textContent=message;notice.hidden=!message;
  };
  const secureLinks=(field:HTMLElement)=>{
    field.querySelectorAll<HTMLAnchorElement>('[data-description-preview] a').forEach(link=>{
      const href=normalizeDescriptionUrl(link.getAttribute('href')||'');
      if(!href){link.replaceWith(...link.childNodes);return;}
      link.href=href;link.target='_blank';link.rel='noopener noreferrer';
    });
  };
  const renderPreview=(field:HTMLElement)=>{
    const textarea=inputFor(field),state=stateFor(field),preview=field.querySelector<HTMLElement>('[data-description-preview]')!;
    if(state.rendered!==textarea.value){preview.innerHTML=previewHtml(textarea.value);state.rendered=textarea.value;}
    secureLinks(field);
  };
  const mode=(field:HTMLElement,value:DescriptionMode)=>{
    const textarea=inputFor(field),next=textarea.readOnly?'preview':value;field.dataset.descriptionMode=next;
    field.querySelector<HTMLElement>('[data-description-compose]')!.hidden=next!=='edit';
    field.querySelector<HTMLElement>('[data-description-preview]')!.hidden=next!=='preview';
    field.querySelectorAll<HTMLButtonElement>('[data-description-mode-button]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.descriptionModeButton===next)));
    if(next==='preview')renderPreview(field);
  };
  const selection=(textarea:HTMLTextAreaElement):Selection=>({start:textarea.selectionStart,end:textarea.selectionEnd});
  const commit=(field:HTMLElement)=>{
    const textarea=inputFor(field),state=stateFor(field);
    if(textarea.readOnly||state.committed===textarea.value)return;
    state.committed=textarea.value;textarea.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const panel=(field:HTMLElement,visible:boolean)=>{
    const element=field.querySelector<HTMLElement>('[data-description-link-panel]')!;
    element.hidden=!visible;element.querySelectorAll<HTMLInputElement>('input').forEach(input=>input.disabled=!visible);
  };
  const apply=(field:HTMLElement,patch:Patch)=>{
    const textarea=inputFor(field),state=stateFor(field),version=state.inputVersion;
    if(patch.value.length>10000)throw new Error('Description can contain at most 10,000 characters.');
    textarea.focus({preventScroll:true});textarea.setSelectionRange(patch.replaceStart,patch.replaceEnd);
    // The browser command retains native undo where supported. The fallback
    // gives identical text and selection without requiring an editable HTML DOM.
    try{textarea.ownerDocument.execCommand('insertText',false,patch.text);}catch{/* Use the standard textarea API below. */}
    const fallback=textarea.value!==patch.value;
    if(fallback)textarea.value=patch.value;
    textarea.setSelectionRange(patch.selectionStart,patch.selectionEnd);
    state.selection=selection(textarea);state.rendered=undefined;
    if(fallback||state.inputVersion===version)textarea.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:patch.text}));
    error(field);
  };
  const edit=(field:HTMLElement)=>{
    mode(field,'edit');const textarea=inputFor(field),state=stateFor(field);
    textarea.focus({preventScroll:true});
    const range=state.selection||{start:textarea.value.length,end:textarea.value.length};textarea.setSelectionRange(range.start,range.end);
  };
  const openLink=(field:HTMLElement)=>{
    const textarea=inputFor(field),state=stateFor(field);state.linkSelection=selection(textarea);state.selection=state.linkSelection;
    field.querySelector<HTMLInputElement>('[data-description-link-text]')!.value=textarea.value.slice(state.linkSelection.start,state.linkSelection.end);
    field.querySelector<HTMLInputElement>('[data-description-link-url]')!.value='';
    panel(field,true);error(field);
    field.querySelector<HTMLInputElement>('[data-description-link-url]')!.focus({preventScroll:true});
  };
  const closeLink=(field:HTMLElement)=>{
    panel(field,false);error(field);const textarea=inputFor(field),range=stateFor(field).linkSelection;
    textarea.focus({preventScroll:true});if(range)textarea.setSelectionRange(range.start,range.end);
    delete stateFor(field).linkSelection;
  };
  const addLink=(field:HTMLElement)=>{
    const textarea=inputFor(field),state=stateFor(field),range=state.linkSelection||selection(textarea);
    const label=field.querySelector<HTMLInputElement>('[data-description-link-text]')!.value;
    const href=field.querySelector<HTMLInputElement>('[data-description-link-url]')!.value;
    try{const patch=applyDescriptionLink(textarea.value,range.start,range.end,label,href);panel(field,false);apply(field,patch);delete state.linkSelection;}
    catch(failure){error(field,failure instanceof Error?failure.message:'Choose a valid link URL.');}
  };
  const pointerdown=(event:PointerEvent)=>{
    const field=fieldFor(event.target);if(!field||!root.contains(field))return;
    const target=event.target as Element;
    if(target.closest('[data-description-command],[data-description-mode-button]'))event.preventDefault();
  };
  const click=(event:MouseEvent)=>{
    const field=fieldFor(event.target);if(!field||!root.contains(field))return;
    const target=event.target as Element,textarea=inputFor(field);
    const tab=target.closest<HTMLButtonElement>('[data-description-mode-button]');
    if(tab){
      if(tab.dataset.descriptionModeButton==='edit')edit(field);
      else{stateFor(field).selection=selection(textarea);if(textarea.ownerDocument.activeElement===textarea)textarea.blur();commit(field);panel(field,false);mode(field,'preview');field.querySelector<HTMLElement>('[data-description-preview]')!.focus({preventScroll:true});}
      return;
    }
    const command=target.closest<HTMLButtonElement>('[data-description-command]');
    if(command&&!textarea.readOnly){
      if(command.dataset.descriptionCommand==='link'){openLink(field);return;}
      try{const range=selection(textarea);apply(field,formatDescription(textarea.value,range.start,range.end,command.dataset.descriptionCommand as Action));}
      catch(failure){error(field,failure instanceof Error?failure.message:'Unable to format this text.');}
    }else if(target.closest('[data-description-link-cancel]'))closeLink(field);
    else if(target.closest('[data-description-link-add]'))addLink(field);
  };
  const input=(event:Event)=>{
    const target=event.target;if(!(target instanceof HTMLTextAreaElement)||!target.matches('[data-description-input]'))return;
    const field=fieldFor(target);if(!field)return;const state=stateFor(field);state.inputVersion++;state.selection=selection(target);state.rendered=undefined;error(field);
    callbacks.onInput?.(target.value,target);
  };
  const change=(event:Event)=>{
    const target=event.target;if(!(target instanceof HTMLTextAreaElement)||!target.matches('[data-description-input]'))return;
    const field=fieldFor(target);if(!field)return;stateFor(field).committed=target.value;renderPreview(field);callbacks.onCommit?.(target.value,target);
  };
  const keydown=(event:KeyboardEvent)=>{
    const field=fieldFor(event.target);if(!field||!root.contains(field))return;
    const textarea=inputFor(field),linkPanel=field.querySelector<HTMLElement>('[data-description-link-panel]')!;
    if(!linkPanel.hidden&&event.key==='Escape'){event.preventDefault();event.stopPropagation();closeLink(field);return;}
    if(!linkPanel.hidden&&event.key==='Enter'&&(event.target as Element).matches('[data-description-link-text],[data-description-link-url]')){event.preventDefault();event.stopPropagation();addLink(field);return;}
    if(event.target===textarea&&(event.metaKey||event.ctrlKey)&&!event.altKey&&!event.shiftKey&&['b','i'].includes(event.key.toLowerCase())&&!textarea.readOnly){
      event.preventDefault();const range=selection(textarea);
      try{apply(field,formatDescription(textarea.value,range.start,range.end,event.key.toLowerCase()==='b'?'bold':'italic'));}
      catch(failure){error(field,failure instanceof Error?failure.message:'Unable to format this text.');}return;
    }
    const command=(event.target as Element).closest<HTMLButtonElement>('[data-description-command]');
    if(command&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();const buttons=[...field.querySelectorAll<HTMLButtonElement>('[data-description-command]')],index=buttons.indexOf(command);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length;
      buttons.forEach((button,i)=>button.tabIndex=i===next?0:-1);buttons[next].focus();return;
    }
    // Save an unblurred inspector draft before the surrounding drawer handles
    // Escape. Creation dialogs may still discard their whole draft as usual.
    if(event.key==='Escape'&&event.target===textarea)commit(field);
  };
  root.addEventListener('pointerdown',pointerdown);root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('keydown',keydown);
  const refresh=()=>{
    const fields=[...(root.matches('[data-description-field]')?[root]:[]),...root.querySelectorAll<HTMLElement>('[data-description-field]')];
    fields.forEach(field=>{
      stateFor(field);mode(field,field.dataset.descriptionMode==='preview'?'preview':'edit');renderPreview(field);
    });
  };
  refresh();
  return {refresh,destroy(){root.removeEventListener('pointerdown',pointerdown);root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('keydown',keydown);}};
}
