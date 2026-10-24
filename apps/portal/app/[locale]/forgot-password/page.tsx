import { BackToLogin } from '../../../components/auth/auth-links';
import { authMetadata, renderAuthPage, type AuthPageProps } from '../../../components/auth/auth-page';
import { ForgotPasswordForm } from '../../../components/auth/forgot-password-form';

export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) => authMetadata(props, 'forgot.title');

export default function Page(props: AuthPageProps) {
  return renderAuthPage({
    params: props.params,
    titleKey: 'forgot.title',
    descriptionKey: 'forgot.description',
    footer: <BackToLogin />,
    children: () => <ForgotPasswordForm />,
  });
}
