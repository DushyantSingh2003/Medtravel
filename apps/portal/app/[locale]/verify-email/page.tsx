import {
  authMetadata,
  renderAuthPage,
  tokenOf,
  type AuthPageProps,
} from '../../../components/auth/auth-page';
import { VerifyEmail } from '../../../components/auth/link-actions';

export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) =>
  authMetadata(props, 'verifyEmail.title', true);

export default async function Page(props: AuthPageProps) {
  const token = await tokenOf(props.searchParams);
  return renderAuthPage({
    params: props.params,
    titleKey: 'verifyEmail.title',
    redirectSignedIn: false,
    children: () => <VerifyEmail token={token} />,
  });
}
