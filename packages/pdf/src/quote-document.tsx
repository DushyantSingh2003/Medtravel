import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface QuoteDocumentProps {
  quoteNumber: string;
  patientName: string;
  hospitalName: string;
  currency: string;
  totalAmount: number;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, color: '#1f2937' },
  title: { fontSize: 18, color: '#1b3b72', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  total: { marginTop: 20, fontSize: 14, color: '#1b3b72' },
});

/**
 * Minimal branded quote. Rendered in the worker (pdf queue), never in a request, because
 * PDF rendering is slow. The real line items arrive with the quotes module.
 */
export function QuoteDocument({
  quoteNumber,
  patientName,
  hospitalName,
  currency,
  totalAmount,
}: QuoteDocumentProps) {
  return (
    <Document title={`Quote ${quoteNumber}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Treatment quote {quoteNumber}</Text>
        <View style={styles.row}>
          <Text>Patient</Text>
          <Text>{patientName}</Text>
        </View>
        <View style={styles.row}>
          <Text>Hospital</Text>
          <Text>{hospitalName}</Text>
        </View>
        <Text style={styles.total}>
          Total: {currency} {totalAmount.toLocaleString('en-US')}
        </Text>
      </Page>
    </Document>
  );
}
