'use client';

import {useEffect,useRef} from 'react';
import {bindDescriptionFields,descriptionFieldMarkup} from './description-field';
import './description-field.css';

export interface DescriptionEditorProps {
  id:string;
  name?:string;
  label?:string;
  value:string;
  onChange:(value:string)=>void;
  onCommit?:(value:string)=>void;
  readOnly?:boolean;
  mode?:'edit'|'preview';
}

/** Keep the native field mounted while its controlled owner updates the draft. */
export function DescriptionEditor({id,name='description',label='Description',value,onChange,onCommit,readOnly=false,mode='edit'}:DescriptionEditorProps){
  const host=useRef<HTMLDivElement>(null);
  const controller=useRef<ReturnType<typeof bindDescriptionFields>|null>(null);
  const current=useRef({value,onChange,onCommit});
  const reportedValue=useRef(value);
  current.current={value,onChange,onCommit};

  useEffect(()=>{
    const element=host.current;if(!element)return;
    element.innerHTML=descriptionFieldMarkup({id,name,label,value:current.current.value,readOnly,mode});
    reportedValue.current=current.current.value;
    const report=(next:string)=>{
      if(reportedValue.current===next)return;
      reportedValue.current=next;current.current.onChange(next);
    };
    const bound=bindDescriptionFields(element,{
      onInput:report,
      onCommit(next){report(next);current.current.onCommit?.(next);},
    });
    controller.current=bound;bound.refresh();
    return()=>{bound.destroy();if(controller.current===bound)controller.current=null;element.replaceChildren();};
  },[id,name,label,readOnly,mode]);

  useEffect(()=>{
    const textarea=host.current?.querySelector<HTMLTextAreaElement>('[data-description-input]');
    reportedValue.current=value;
    // Input callbacks already changed the native field. Replacing its markup
    // here would discard focus, selection, link drafts and the browser undo stack.
    if(textarea&&textarea.value!==value){textarea.value=value;controller.current?.refresh();}
  },[value]);

  return <div ref={host} className="description-editor-host"/>;
}
