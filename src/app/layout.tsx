import type { Metadata } from 'next';
import '../planner/styles.css';
import './entry.css';
import './globals.css';
export const metadata: Metadata = { title: 'Orbit — Adaptive Roadmap Planner', description: 'Roadmaps that adapt to reality. Plan features around team capacity, meetings, time off, and dependencies.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
