import { getTranslations } from 'next-intl/server';
import { AuthLink } from '../../../components/auth/auth-links';
import { authMetadata, renderAuthPage, type AuthPageProps } from '../../../components/auth/auth-page';
import { LoginForm } from '../../../components/auth/login-form';

/** Reads the session, so it must be rendered per request. */
export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) => authMetadata(props, 'login.title');

export default async function Page(props: AuthPageProps) {
  const t = await getTranslations('auth.login');
  return renderAuthPage({
    params: props.params,
    titleKey: 'login.title',
    descriptionKey: 'login.description',
    footer: <AuthLink href="/register">{t('register')}</AuthLink>,
    children: () => <LoginForm />,
  });
}
