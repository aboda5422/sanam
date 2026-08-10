import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'سنام سوبر ماركت'

interface OrderDeliveredProps {
  customerName?: string
  orderNumber?: string | number
  ratingUrl?: string
  driverName?: string
}

const OrderDeliveredEmail = ({
  customerName,
  orderNumber,
  ratingUrl,
  driverName,
}: OrderDeliveredProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>تم تسليم طلبك رقم {String(orderNumber ?? '')} بنجاح ✅</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>{SITE_NAME}</Heading>
          <Text style={tagline}>تم التسليم بنجاح</Text>
        </Section>

        <Section style={card}>
          <Heading style={h2}>
            {customerName ? `${customerName}، تم تسليم طلبك ✅` : 'تم تسليم طلبك ✅'}
          </Heading>
          <Text style={text}>
            يسعدنا إخبارك بأنه تم تسليم طلبك رقم <strong>#{String(orderNumber ?? '-')}</strong> بنجاح.
            {driverName && <> نشكر مندوب التوصيل <strong>{driverName}</strong> على جهوده.</>}
          </Text>

          <Hr style={hr} />

          <Heading style={h3}>كيف كانت تجربتك مع المندوب؟ ⭐</Heading>
          <Text style={text}>
            تقييمك يساعدنا على تحسين خدمتنا ويُكرّم المندوب على عمله. لا يستغرق الأمر سوى ثوانٍ.
          </Text>

          {ratingUrl && (
            <Section style={{ textAlign: 'center' as const, padding: '8px 0' }}>
              <Button href={ratingUrl} style={button}>
                قيّم المندوب الآن
              </Button>
              <Text style={smallText}>
                أو افتح الرابط: <br />
                <span style={linkText}>{ratingUrl}</span>
              </Text>
            </Section>
          )}
        </Section>

        <Text style={footer}>
          شكراً لاختيارك {SITE_NAME}. نتطلع لخدمتك في طلبك القادم.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OrderDeliveredEmail,
  subject: (d: Record<string, any>) =>
    `✅ تم تسليم طلبك #${d.orderNumber ?? ''} - قيّم تجربتك`,
  displayName: 'تم تسليم الطلب',
  previewData: {
    customerName: 'محمد',
    orderNumber: 1024,
    ratingUrl: 'https://sanam.xbarawa.com/order/abc-123?rate=1',
    driverName: 'أحمد',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Tahoma, Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const header = { textAlign: 'center' as const, padding: '16px 0' }
const brand = { fontSize: '26px', fontWeight: 'bold', color: '#1a3c2a', margin: 0 }
const tagline = { fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }
const card = { backgroundColor: '#f7faf7', borderRadius: '12px', padding: '24px', border: '1px solid #e5ebe5' }
const h2 = { fontSize: '20px', fontWeight: 'bold', color: '#1a3c2a', margin: '0 0 12px' }
const h3 = { fontSize: '16px', fontWeight: 'bold', color: '#1a3c2a', margin: '8px 0 8px' }
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