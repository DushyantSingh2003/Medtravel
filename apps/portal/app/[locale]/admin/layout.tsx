import type { ReactNode } from 'react';
import { PortalLayout, portalLayoutMetadata } from '../../../components/portal/portal-layout';

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export const generateMetadata = (props: Pick<Props, 'params'>) =>
  portalLayoutMetadata('admin', props);

export default function Layout(props: Props) {
  return <PortalLayout portal="admin" {...props} />;
}
