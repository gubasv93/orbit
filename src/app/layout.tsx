import type { Metadata } from 'next';
import '../planner/styles.css';
import './entry.css';
import './globals.css';
import './appearance.css';
import '../planner/visual-theme.css';
import { AppearanceProvider } from '@/components/appearance';
import { CookieConsent } from '@/components/cookie-consent';
export const metadata: Metadata = { title: 'Orbit — Adaptive Roadmap Planner', description: 'Plan features and role-based estimates around meetings, days off and dependencies. Estimate together with Planning Poker.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="light" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html: "try{document.documentElement.dataset.theme=localStorage.getItem('orbit-appearance')==='dark'?'dark':'light'}catch{}"}}/></head><body><AppearanceProvider>{children}<CookieConsent/></AppearanceProvider></body></html>;
}
