import { RECEIPT_TRANSLATION_FIELDS } from './constants';

export enum ReceiptStatus {
  PROCCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  ERROR = 'ERROR',
}

export type ReceiptEntity = {
  PK: string;
  SK: string;
  id: string;
  fileName: string;
  vendor: string;
  total: number;
  currency: string;
  category?: string;
  date: string;
  items: string[];
  createdAt: string;
  status: ReceiptStatus;
  rawText?: string;
  s3Path?: string;
  tags?: string[];
};

export type ReceiptAIResponse = Pick<
  ReceiptEntity,
  'vendor' | 'total' | 'currency' | 'category' | 'date' | 'items'
> & { detectedLanguage: string };

export type MutableReceiptAIResponse = Omit<ReceiptAIResponse, 'items'> & {
  items: string[];
  vendor: string;
};
export type TranslatableFields = (typeof RECEIPT_TRANSLATION_FIELDS)[number];
