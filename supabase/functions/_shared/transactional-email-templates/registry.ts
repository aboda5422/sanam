/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as paymentReceipt } from './payment-receipt.tsx'
import { template as orderOnTheWay } from './order-on-the-way.tsx'
import { template as orderDelivered } from './order-delivered.tsx'
import { template as welcome } from './welcome.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'payment-receipt': paymentReceipt,
  'order-on-the-way': orderOnTheWay,
  'order-delivered': orderDelivered,
  'welcome': welcome,
}