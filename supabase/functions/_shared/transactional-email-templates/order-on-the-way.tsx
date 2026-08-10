import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'سلة بازار المواسم'

interface OrderOnTheWayProps {
  customerName?: string
  orderNumber?: string | number
  trackingUrl?: string
  driverName?: string
  estimatedMinutes?: number
}

const OrderOnTheWayEmail = ({
  customerName,
  orderNumber,
  trackingUrl,
  driverName,
  estimatedMinutes,
}: OrderOnTheWayProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>طلبك رقم {String(orderNumber ?? '')} في الطريق إليك 🚚</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>{SITE_NAME}</Heading>
          <Text style={tagline}>طلبك في الطريق</Text>
        </Section>

        <Section style={card}>
          <Heading style={h2}>
            {customerName ? `${customerName}، طلبك في الطريق 🚚` : 'طلبك في الطريق 🚚'}
          </Heading>
          <Text style={text}>
            تم تجهيز طلبك رقم <strong>#{String(orderNumber ?? '-')}</strong> وخرج للتوصيل.
            {driverName && <> سيقوم المندوب <strong>{driverName}</strong> بتوصيله إليك.</>}
            {estimatedMinutes && <> الوقت المتوقع للوصول: <strong>{estimatedMinutes} دقيقة</strong>.</>}
          </Text>

          {trackingUrl && (
            <>
              <Hr style={hr} />
              <Section style={{ textAlign: 'center' as const, padding: '8px 0' }}>
                <Button href={trackingUrl} style={button}>
                  تتبع طلبك مباشرة
                </Button>
                <Text style={smallText}>
                  أو افتح الرابط: <br />
                  <span style={linkText}>{trackingUrl}</span>
                </Text>
              </Section>
            </>
          )}
        </Section>

        <Text style={footer}>
          يُرجى التواجد في عنوان التوصيل لاستلام طلبك. شكراً لاختيارك {SITE_NAME}.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OrderOnTheWayEmail,
  subject: (d: Record<string, any>) =>
    `🚚 طلبك #${d.orderNumber ?? ''} في الطريق إليك - ${SITE_NAME}`,
  displayName: 'الطلب في الطريق',
  previewData: {
    customerName: 'محمد',
    orderNumber: 1024,
    trackingUrl: 'https://sanam.sa/order/abc-123',
    driverName: 'أحمد',
    estimatedMinutes: 25,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Tahoma, Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const header = { textAlign: 'center' as const, padding: '16px 0' }
const brand = { fontSize: '26px', fontWeight: 'bold', color: '#1a3c2a', margin: 0 }
const tagline = { fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }
const card = { backgroundColor: '#f7faf7', borderRadius: '12px', padding: '24px', border: '1px solid #e5ebe5' }
const h2 = { fontSize: '20px', fontWeight: 'bold', color: '#1a3c2a', margin: '0 0 12px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0 0 16px' }
const hr = { borderColor: '#e5ebe5', margin: '16px 0' }
const button = {
  backgroundColor: '#1a3c2a',
  color: '#ffffff',
  padding: '14px 32px',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}
const smallText = { fontSize: '12px', color: '#6b7280', margin: '14px 0 0', lineHeight: '1.5' }
const linkText = { color: '#1a3c2a', wordBreak: 'break-all' as const, fontSize: '11px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '24px 0 0' }
