import { feedbackFormUrl } from '@/lib/feedback';
import './feedback-link.css';

export function FeedbackLink({className = ''}: {className?: string}) {
  return <a className={`feedback-link ${className}`} href={feedbackFormUrl} target="_blank" rel="noopener noreferrer"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 3V11.5A7.5 7.5 0 0 1 10.5 4h2a7.5 7.5 0 0 1 7.5 7.5Z"/><path d="M8 10h7m-7 4h4"/></svg><span>Share feedback</span><svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6m0-6L10 14m0-10H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg></a>;
}
