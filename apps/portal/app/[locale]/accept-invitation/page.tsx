import { AcceptInvitation } from '../../../components/auth/accept-invitation';
import {
  authMetadata,
  renderAuthPage,
  tokenOf,
  type AuthPageProps,
} from '../../../components/auth/auth-page';

export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) =>
  authMetadata(props, 'invitation.title', true);

export default async function Page(props: AuthPageProps) {
  const token = await tokenOf(props.searchParams);
  return renderAuthPage({
    params: props.params,
    titleKey: 'invitation.title',
    redirectSignedIn: false,
    children: () => <AcceptInvitation token={token} />,
  });
}
