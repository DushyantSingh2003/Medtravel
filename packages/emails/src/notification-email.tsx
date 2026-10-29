import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  render,
} from '@react-email/components';
import type { Locale } from '@medtravel/i18n';
import { directionOf } from '@medtravel/i18n';

export interface NotificationEmailProps {
  title: string;
  body: string;
  locale?: Locale;
  /** The line under the message ("Sent by MedTravel"), already translated. */
  footer?: string;
}

/** The one layout every notification email uses: the text is chosen by the engine, so the layout holds none of its own. */
export function NotificationEmail({ title, body, locale = 'en', footer }: NotificationEmailProps) {
  return (
    <Html lang={locale} dir={directionOf(locale)}>
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: '#f6f8fb', fontFamily: 'ui-sans-serif, system-ui' }}>
        <Container style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px' }}>
          <Heading as="h1" style={{ fontSize: '20px', color: '#1b3b72' }}>
            {title}
          </Heading>
          {body.split('\n').map((line, index) => (
            <Text key={index} style={{ color: '#334155', fontSize: '14px', lineHeight: '22px' }}>
              {line}
            </Text>
          ))}
          {footer ? <Text style={{ color: '#64748b', fontSize: '12px' }}>{footer}</Text> : null}
        </Container>
      </Body>
    </Html>
  );
}

export function renderNotificationEmail(props: NotificationEmailProps): Promise<string> {
  return render(<NotificationEmail {...props} />);
}
