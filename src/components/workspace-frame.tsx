'use client';

import Link from 'next/link';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import type {AccountProfile} from '@/lib/profile';
import {workspaceNavItems, workspacePageLink} from '@/lib/workspace-navigation';
import {FeedbackLink} from './feedback-link';
import './workspace-frame.css';

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(); }
function NavigationIcon({name}: {name: string}) {
  const paths: Record<string, ReactNode> = {
    timeline: <><path d="M4 5h16M4 12h16M4 19h16"/><path d="M8 3v4m7 3v4m-4 3v4"/></>,
    settings: <><circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2M18 5h4m-2-2v4"/></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/></>,
    flag: <path d="M5 22V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>,
    layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    sliders: <><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6m-6 0v6"/></>,
  };
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.layers}</svg>;
}

type Props = {projectId?: string; projectName?: string; profile?: AccountProfile | null; owner?: boolean; room?: boolean; active: string; title: string; children: ReactNode};
export function WorkspaceFrame({projectId, projectName, profile, owner = true, room = false, active, title, children}: Props) {
  const [menu, setMenu] = useState(false), navRef = useRef<HTMLElement>(null), toggleRef = useRef<HTMLButtonElement>(null);
  const navigationId = 'poker-project-navigation';
  function closeNavigation() { setMenu(false); requestAnimationFrame(() => toggleRef.current?.focus()); }
  function openNavigation() { setMenu(true); requestAnimationFrame(() => navRef.current?.querySelector<HTMLButtonElement>('button')?.focus()); }
  useEffect(() => { setMenu(window.matchMedia('(min-width:901px)').matches); }, []);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: KeyboardEvent) => {
      if (document.querySelector('.poker-dialog')) return;
      if (event.key === 'Escape') { event.preventDefault(); closeNavigation(); return; }
      if (event.key !== 'Tab' || !window.matchMedia('(max-width:900px)').matches || !navRef.current) return;
      const panel = navRef.current;
      const fields = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(element => element.offsetParent !== null);
      const first = fields[0], last = fields.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [menu]);

  // Room guests never receive links containing the facilitator's project identifier.
  const ownProjectId = owner ? projectId : undefined;
  const roadmapLink = workspacePageLink('/app', ownProjectId);
  function navLink(id: string) {
    if (id === 'poker') return workspacePageLink('/poker/new', ownProjectId);
    const query = new URLSearchParams(ownProjectId ? {project: ownProjectId} : {});
    if (id === 'settings' || id === 'meetings') query.set('panel', id);
    else if (id !== 'timeline') query.set('page', id);
    return '/app' + (query.size ? '?' + query : '');
  }
  return <div className={`workspace-frame poker-layout ${room ? 'poker-room-layout' : ''} ${menu ? 'poker-nav-open' : 'poker-nav-collapsed'}`}>
    {menu && <button className="poker-nav-scrim" aria-label="Dismiss project navigation" onClick={closeNavigation}/>}
    <aside ref={navRef} id={navigationId} className="poker-nav workspace-sidebar" aria-label="Project navigation" hidden={!menu}>
      <div className="poker-nav-heading"><Link prefetch={false} className="brand workspace-brand" href={owner || profile ? roadmapLink : '/'}><span className="brand-mark"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg></span><span>orbit<small>PLANNER</small></span></Link><button className="icon-action" aria-label="Hide project navigation" aria-expanded={menu} aria-controls={navigationId} onClick={closeNavigation}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <nav className="workspace-main-nav" aria-label="Workspace"><div className="nav-caption">Workspace</div>
        {projectName && (owner ? <Link prefetch={false} className="project-trigger" href={roadmapLink} title="Open project roadmap"><NavigationIcon name="layers"/><span>{projectName}</span></Link> : <div className="project-trigger workspace-project-name"><NavigationIcon name="layers"/><span>{projectName}</span></div>)}
        {owner && <><Link prefetch={false} className="project-new" href={navLink('timeline') + (ownProjectId ? '&' : '?') + 'panel=projects'}><span aria-hidden="true">+</span> Switch project</Link>{workspaceNavItems.map(item => <Link prefetch={false} key={item.id} href={navLink(item.id)} className={`nav-item poker-nav-item ${item.id === active ? 'active' : ''}`} aria-current={item.id === active ? 'page' : undefined}><NavigationIcon name={item.icon}/><span>{item.label}</span></Link>)}</>}
      </nav>
      <div className="poker-nav-bottom workspace-sidebar-footer"><Link prefetch={false} className={`workspace-help ${active === 'help' ? 'active' : ''}`} aria-current={active === 'help' ? 'page' : undefined} href={workspacePageLink('/how-it-works', ownProjectId)}><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg><span>How it works</span></Link><FeedbackLink className="workspace-sidebar-feedback"/><Link prefetch={false} href={workspacePageLink('/profile', ownProjectId)} className={`workspace-profile ${active === 'profile' ? 'active' : ''}`} aria-current={active === 'profile' ? 'page' : undefined}><span className="workspace-profile-avatar" aria-hidden="true">{profile?.displayName ? initials(profile.displayName) : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>}</span><span><strong>Profile</strong><small>{profile?.displayName || profile?.email || 'Sign in to your workspace'}</small></span></Link></div>
    </aside>
    <div className="poker-main">{!menu && <div className="poker-mobile-nav"><button className="btn sm" ref={toggleRef} aria-label="Show project navigation" aria-expanded={menu} aria-controls={navigationId} onClick={openNavigation}><span aria-hidden="true">☰</span><span>{projectName || 'Project navigation'}</span></button><span>{title}</span></div>}{children}</div>
  </div>;
}
