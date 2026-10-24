import { getTranslations } from 'next-intl/server';
import { AuthLink } from '../../../components/auth/auth-links';
import { authMetadata, renderAuthPage, type AuthPageProps } from '../../../components/auth/auth-page';
import { RegisterForm } from '../../../components/auth/register-form';

export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) => authMetadata(props, 'register.title');

export default async function Page(props: AuthPageProps) {
  const t = await getTranslations('auth.register');
  return renderAuthPage({
    params: props.params,
    titleKey: 'register.title',
    descriptionKey: 'register.description',
    footer: <AuthLink href="/login">{t('haveAccount')}</AuthLink>,
    children: () => <RegisterForm />,
  });
}
