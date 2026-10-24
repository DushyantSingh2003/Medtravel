import { authMetadata, renderAuthPage, tokenOf, type AuthPageProps } from '../../../components/auth/auth-page';
import { MagicLink } from '../../../components/auth/link-actions';

export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) => authMetadata(props, 'magic.title', true);

export default async function Page(props: AuthPageProps) {
  const token = await tokenOf(props.searchParams);
  return renderAuthPage({
    params: props.params,
    titleKey: 'magic.title',
    redirectSignedIn: false,
    children: () => <MagicLink token={token} />,
  });
}
