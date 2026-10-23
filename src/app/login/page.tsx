import { AuthPage } from '@/components/auth-page';
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const notice = params.setup ? 'The owner is still connecting authentication. Please try again later.' : params.confirmation ? 'The confirmation link is invalid or expired. Please try logging in or contact the owner.' : undefined;
  return <AuthPage mode="login" notice={notice}/>;
}
