import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components';
import type { Locale } from '@medtravel/i18n';
import { directionOf } from '@medtravel/i18n';

export interface WelcomeEmailProps {
  patientName: string;
  locale?: Locale;
}

/**
 * First transactional template, and the pattern the rest follow: plain props, locale-aware
 * direction, no inline images. Sending happens in the worker (notifications queue).
 */
export function WelcomeEmail({ patientName, locale = 'en' }: WelcomeEmailProps) {
  const dir = directionOf(locale);
  return (
    <Html lang={locale} dir={dir}>
      <Head />
      <Preview>Your MedTravel case has been opened</Preview>
      <Body style={{ backgroundColor: '#f6f8fb', fontFamily: 'ui-sans-serif, system-ui' }}>
        <Container style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px' }}>
          <Heading as="h1" style={{ fontSize: '20px', color: '#1b3b72' }}>
            Welcome, {patientName}
          </Heading>
          <Text style={{ color: '#334155', fontSize: '14px' }}>
            Your case has been opened. A coordinator will review your reports and come back with
            an expert opinion and a clear quote.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
