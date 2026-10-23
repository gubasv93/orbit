import { PublicHeader, Footer } from './brand';
import { AuthForm } from './auth-form';
export function AuthPage({ mode, notice }: { mode: 'login' | 'signup'; notice?: string }) {
  return <div className="entry-shell"><PublicHeader auth/><main className="auth-layout"><div className="auth-intro"><span className="entry-label">✦ Your planning workspace</span><h1>Less planning overhead.<br/>More clarity.</h1><p>Keep your team, roadmap, and delivery dates together. Your first project starts with a simple two-step setup.</p><div className="entry-proof"><span>✓ Effort-based planning</span><span>✓ Recurring meetings and holidays</span><span>✓ Gantt and resource capacity</span></div></div><section className="auth-card"><AuthForm mode={mode} initialNotice={notice}/></section></main><Footer/></div>;
}
