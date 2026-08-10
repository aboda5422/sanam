import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'سنام سوبر ماركت'
const SITE_URL = 'https://sanam.xbarawa.com'

interface WelcomeProps {
  customerName?: string
}

const WelcomeEmail = ({ customerName }: WelcomeProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>مرحباً بك في {SITE_NAME} - بقالتك توصلك خلال دقائق 🛒</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>{SITE_NAME}</Heading>
          <Text style={tagline}>بقالتك توصلك خلال دقائق</Text>
        </Section>

        <Section style={card}>
          <Heading style={h2}>
            {customerName ? `أهلاً وسهلاً ${customerName} 👋` : 'أهلاً وسهلاً بك 👋'}
          </Heading>
          <Text style={text}>
            يسعدنا انضمامك إلى عائلة <strong>{SITE_NAME}</strong>. أصبحت الآن جاهزاً
            للتسوق من تشكيلة واسعة من أجود المنتجات الطازجة وتوصيلها إلى باب منزلك.
          </Text>

          <Hr style={hr} />
          <Heading style={h3}>لماذا سنام؟</Heading>

          <Row style={featureRow}>
            <Column style={featureIcon}>🥬</Column>
            <Column style={featureText}>
              <strong>منتجات طازجة</strong> — خضار وفواكه ومنتجات يومية بأعلى جودة
            </Column>
          </Row>
          <Row style={featureRow}>
            <Column style={featureIcon}>🚚</Column>
            <Column style={featureText}>
              <strong>توصيل سريع</strong> — من الفرع الأقرب إليك خلال دقائق
            </Column>
          </Row>
          <Row style={featureRow}>
            <Column style={featureIcon}>💳</Column>
            <Column style={featureText}>
              <strong>دفع آمن</strong> — مدى، فيزا، ماستركارد، Apple Pay، أو نقداً عند الاستلام
            </Column>
          </Row>
          <Row style={featureRow}>
            <Column style={featureIcon}>📍</Column>
            <Column style={featureText}>
              <strong>تتبع مباشر</strong> — تابع طلبك ومندوبك على الخريطة لحظة بلحظة
            </Column>
          </Row>

          <Hr style={hr} />
          <Section style={{ textAlign: 'center' as const, padding: '8px 0' }}>
            <Text style={ctaText}>جاهز لطلبك الأول؟</Text>
            <Button href={SITE_URL} style={button}>
              ابدأ التسوق الآن
            </Button>
          </Section>
        </Section>

        <Text style={footer}>
          إذا احتجت أي مساعدة، فريقنا في خدمتك. شكراً لثقتك بـ {SITE_NAME}.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: () => `أهلاً بك في ${SITE_NAME} 🎉`,
  displayName: 'بريد ترحيبي',
  previewData: { customerName: 'محمد' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Tahoma, Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const header = { textAlign: 'center' as const, padding: '16px 0' }
const brand = { fontSize: '28px', fontWeight: 'bold', color: '#1a3c2a', margin: 0 }
const tagline = { fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }
const card = { backgroundColor: '#f7faf7', borderRadius: '12px', padding: '24px', border: '1px solid #e5ebe5' }
const h2 = { fontSize: '22px', fontWeight: 'bold', color: '#1a3c2a', margin: '0 0 12px' }
const h3 = { fontSize: '16px', fontWeight: 'bold', color: '#1a3c2a', margin: '12px 0 12px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0 0 12px' }
const hr = { borderColor: '#e5ebe5', margin: '16px 0' }
const featureRow = { padding: '8px 0' }
const featureIcon = { fontSize: '22px', width: '36px', verticalAlign: 'top' as const }
const featureText = { fontSize: '13px', color: '#374151', lineHeight: '1.6', verticalAlign: 'top' as const }
const ctaText = { fontSize: '15px', color: '#1a3c2a', fontWeight: 'bold', margin: '0 0 14px' }
const button = {
  backgroundColor: '#1a3c2a',
  color: '#ffffff',
  padding: '14px 36px',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '24px 0 0' }
