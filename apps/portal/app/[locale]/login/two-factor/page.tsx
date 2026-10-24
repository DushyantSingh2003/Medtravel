import { authMetadata, renderAuthPage, type AuthPageProps } from '../../../../components/auth/auth-page';
import { TwoFactorChallengeForm } from '../../../../components/auth/two-factor-challenge-form';

export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) => authMetadata(props, 'twoFactor.title');

export default function Page(props: AuthPageProps) {
  return renderAuthPage({
    params: props.params,
    titleKey: 'twoFactor.title',
    children: () => <TwoFactorChallengeForm />,
  });
}
