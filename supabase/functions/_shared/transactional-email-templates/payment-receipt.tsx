import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'سنام سوبر ماركت'

interface PaymentReceiptProps {
  customerName?: string
  orderNumber?: string | number
  subtotal?: number
  discountPercent?: number
  discountAmount?: number
  deliveryFee?: number
  total?: number
  paymentMethod?: string
  paymentId?: string
  items?: Array<{ name: string; quantity: number; price: number }>
}

const fmt = (n?: number) => (typeof n === 'number' ? n.toFixed(2) : '0.00')

const PaymentReceiptEmail = ({
  customerName,
  orderNumber,
  subtotal,
  discountPercent,
  discountAmount,
  deliveryFee,
  total,
  paymentMethod,
  paymentId,
  items = [],
}: PaymentReceiptProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>إيصال دفع طلبك رقم {String(orderNumber ?? '')} من {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>{SITE_NAME}</Heading>
          <Text style={tagline}>إيصال دفع</Text>
        </Section>

        <Section style={card}>
          <Heading style={h2}>
            {customerName ? `شكراً لك ${customerName} 🎉` : 'شكراً لطلبك 🎉'}
          </Heading>
          <Text style={text}>
            تم استلام دفعتك بنجاح. فيما يلي تفاصيل طلبك:
          </Text>

          <Section style={meta}>
            <Row>
              <Column style={metaLabel}>رقم الطلب</Column>
              <Column style={metaValue}>#{String(orderNumber ?? '-')}</Column>
            </Row>
            <Row>
              <Column style={metaLabel}>طريقة الدفع</Column>
              <Column style={metaValue}>{paymentMethod ?? 'دفع إلكتروني'}</Column>
            </Row>
            {paymentId && (
              <Row>
                <Column style={metaLabel}>رقم العملية</Column>
                <Column style={metaValueMono}>{paymentId}</Column>
              </Row>
            )}
          </Section>

          {items.length > 0 && (
            <>
              <Hr style={hr} />
              <Heading style={h3}>المنتجات</Heading>
              {items.map((it, i) => (
                <Row key={i} style={itemRow}>
                  <Column style={itemName}>{it.name} × {it.quantity}</Column>
                  <Column style={itemPrice}>{fmt(it.price * it.quantity)} ر.س</Column>
                </Row>
              ))}
            </>
          )}

          <Hr style={hr} />
          <Row style={totalRow}>
            <Column style={totalLabel}>المجموع الفرعي</Column>
            <Column style={totalValue}>{fmt(subtotal)} ر.س</Column>
          </Row>
          {typeof discountAmount === 'number' && discountAmount > 0 && (
            <Row style={totalRow}>
              <Column style={{ ...totalLabel, color: '#15803d' }}>
                خصم العميل{discountPercent ? ` (${discountPercent}%)` : ''}
              </Column>
              <Column style={{ ...totalValue, color: '#15803d' }}>−{fmt(discountAmount)} ر.س</Column>
            </Row>
          )}
          <Row style={totalRow}>
            <Column style={totalLabel}>التوصيل</Column>
            <Column style={totalValue}>
              {deliveryFee === 0 ? 'مجاني' : `${fmt(deliveryFee)} ر.س`}
            </Column>
          </Row>
          <Row style={grandRow}>
            <Column style={grandLabel}>الإجمالي المدفوع</Column>
            <Column style={grandValue}>{fmt(total)} ر.س</Column>
          </Row>
        </Section>

        <Text style={footer}>
          إذا كان لديك أي استفسار، يسعدنا تواصلك معنا. شكراً لاختيارك {SITE_NAME}.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PaymentReceiptEmail,
  subject: (d: Record<string, any>) =>
    `إيصال دفع طلبك #${d.orderNumber ?? ''} - ${SITE_NAME}`,
  displayName: 'إيصال دفع',
  previewData: {
    customerName: 'محمد',
    orderNumber: 1024,
    subtotal: 85,
    discountPercent: 10,
    discountAmount: 8.5,
    deliveryFee: 15,
    total: 91.5,
    paymentMethod: 'مدى',
    paymentId: 'pay_abc123',
    items: [
      { name: 'تمر سكري 1 كجم', quantity: 2, price: 25 },
      { name: 'حليب طازج', quantity: 1, price: 35 },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Tahoma, Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const header = { textAlign: 'center' as const, padding: '16px 0' }
const brand = { fontSize: '26px', fontWeight: 'bold', color: '#1a3c2a', margin: 0 }
const tagline = { fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }
const card = { backgroundColor: '#f7faf7', borderRadius: '12px', padding: '24px', border: '1px solid #e5ebe5' }
const h2 = { fontSize: '20px', fontWeight: 'bold', color: '#1a3c2a', margin: '0 0 12px' }
const h3 = { fontSize: '15px', fontWeight: 'bold', color: '#1a3c2a', margin: '12px 0 8px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const meta = { backgroundColor: '#ffffff', borderRadius: '8px', padding: '12px 14px', margin: '12px 0' }
const metaLabel = { fontSize: '13px', color: '#6b7280', padding: '4px 0' }
const metaValue = { fontSize: '13px', color: '#111827', fontWeight: 'bold', textAlign: 'left' as const, padding: '4px 0' }
const metaValueMono = { fontSize: '12px', color: '#111827', fontFamily: 'monospace', textAlign: 'left' as const, padding: '4px 0' }
const hr = { borderColor: '#e5ebe5', margin: '16px 0' }
const itemRow = { padding: '4px 0' }
const itemName = { fontSize: '13px', color: '#374151' }
const itemPrice = { fontSize: '13px', color: '#111827', textAlign: 'left' as const, fontWeight: 'bold' }
const totalRow = { padding: '4px 0' }
const totalLabel = { fontSize: '13px', color: '#6b7280' }
const totalValue = { fontSize: '13px', color: '#111827', textAlign: 'left' as const }
const grandRow = { padding: '12px 0 4px', borderTop: '2px solid #1a3c2a', marginTop: '8px' }
const grandLabel = { fontSize: '15px', color: '#1a3c2a', fontWeight: 'bold' }
const grandValue = { fontSize: '17px', color: '#1a3c2a', fontWeight: 'bold', textAlign: 'left' as const }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '24px 0 0' }