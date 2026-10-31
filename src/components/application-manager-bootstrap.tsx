'use client';

import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import './application-manager.css';

export function ApplicationManagerBootstrap(){
 const [state,setState]=useState<'checking'|'ready'|'unavailable'|'complete'>('checking'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const token=useRef('');
 useEffect(()=>{
  const abort=new AbortController();const fragment=new URLSearchParams(window.location.hash.slice(1));token.current=fragment.get('setup')||fragment.get('token')||token.current;
  // The invitation stays out of request URLs, referrers and browser history.
  window.history.replaceState(null,'','/applicationmanager/bootstrap');
  if(!/^[A-Za-z0-9_-]{40,160}$/.test(token.current)){setState('unavailable');return;}
  fetch('/api/applicationmanager/auth/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.current}),signal:abort.signal}).then(async response=>{
   const result=await response.json();if(abort.signal.aborted)return;if(response.ok&&result.available)setState('ready');else setState('unavailable');
  }).catch(()=>{if(!abort.signal.aborted){setError('Unable to check this invitation. Reopen your original setup link to retry.');setState('unavailable');}});
  return()=>{abort.abort();};
 },[]);
 async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');const form=event.currentTarget,data=new FormData(form);try{
  const response=await fetch('/api/applicationmanager/auth/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.current,email:String(data.get('email')||''),password:String(data.get('password')||''),confirm:String(data.get('confirm')||'')})});
  const result=await response.json();if(!response.ok){if(response.status===404||response.status===409)setState('unavailable');throw new Error(result.error||'Unable to create the administrator.');}
  token.current='';form.reset();setState('complete');window.location.replace('/applicationmanager');
 }catch(cause){setError(cause instanceof Error?cause.message:'Unable to create the administrator. Please retry.');}finally{setBusy(false);}}
 return <div className="am-root am-auth-shell"><header><Link href="/" className="am-brand">orbit</Link><Link href="/" className="am-text-link">Back to Orbit</Link></header><main className="am-auth-card"><span className="am-eyebrow">ONE-TIME ADMINISTRATOR SETUP</span><h1>{state==='ready'?'Create your administrator':state==='complete'?'Administrator created':state==='checking'?'Checking invitation':'Setup link unavailable'}</h1>{state==='ready'?<><p>Choose the credentials for your private application manager. This invitation creates one administrator and then becomes unusable.</p><form onSubmit={create}><div className="am-field"><label htmlFor="am-bootstrap-email">Administrator email</label><input id="am-bootstrap-email" name="email" type="email" autoComplete="username" maxLength={254} required/></div><div className="am-field"><label htmlFor="am-bootstrap-password">Administrator password</label><input id="am-bootstrap-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/><small className="am-footnote">At least 12 characters, including a letter and a number.</small></div><div className="am-field"><label htmlFor="am-bootstrap-confirm">Confirm administrator password</label><input id="am-bootstrap-confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></div>{error&&<p role="alert" className="am-alert am-error">{error}</p>}<button className="am-button am-primary" disabled={busy}>{busy?'Creating administrator…':'Create administrator'}</button></form></>:<div className="am-bootstrap-status">{state==='checking'?<p role="status">Validating your one-time setup link…</p>:state==='complete'?<p role="status">Opening your private application manager…</p>:<><p>This setup invitation is invalid, expired or has already been used.</p>{error&&<p role="alert" className="am-alert am-error">{error}</p>}<Link className="am-button" href="/applicationmanager">Administrator sign in</Link></>}</div>}</main></div>;
}
