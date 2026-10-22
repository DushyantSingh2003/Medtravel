import { PortalPage, portalPageMetadata } from '../../../../components/portal/portal-page';

type Props = { params: Promise<{ locale: string; slug?: string[] }> };

export const generateMetadata = (props: Props) => portalPageMetadata('ops', props);

export default function Page(props: Props) {
  return <PortalPage portal="ops" {...props} />;
}
