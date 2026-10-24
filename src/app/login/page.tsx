import { AuthPage } from '@/components/auth-page';
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const notice = params.setup ? 'The owner is still connecting authentication. Please try again later.'
    : params.oauth === 'cancelled' ? 'Google sign-in was cancelled. You can try again or use email and password.'
    : params.oauth ? 'Google sign-in could not be completed. Please try again or use email and password.'
    : params.auth ? 'This sign-in link is invalid or expired, or was opened in a different browser. Please start signing in again.'
    : params.confirmation ? 'The confirmation link is invalid or expired. Please try logging in or contact the owner.' : undefined;
  return <AuthPage mode="login" notice={notice}/>;
}
