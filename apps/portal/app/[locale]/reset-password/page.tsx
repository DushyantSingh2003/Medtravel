import {
  authMetadata,
  renderAuthPage,
  tokenOf,
  type AuthPageProps,
} from '../../../components/auth/auth-page';
import { ResetPasswordForm } from '../../../components/auth/reset-password-form';

export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) => authMetadata(props, 'reset.title', true);

export default async function Page(props: AuthPageProps) {
  const token = await tokenOf(props.searchParams);
  return renderAuthPage({
    params: props.params,
    titleKey: 'reset.title',
    children: () => <ResetPasswordForm token={token} />,
  });
}
