import { BackToLogin } from '../../../../components/auth/auth-links';
import {
  authMetadata,
  renderAuthPage,
  type AuthPageProps,
} from '../../../../components/auth/auth-page';
import { LoginCodeForm } from '../../../../components/auth/login-code-form';

export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) => authMetadata(props, 'loginCode.title');

export default function Page(props: AuthPageProps) {
  return renderAuthPage({
    params: props.params,
    titleKey: 'loginCode.title',
    descriptionKey: 'loginCode.description',
    footer: <BackToLogin />,
    children: () => <LoginCodeForm />,
  });
}
