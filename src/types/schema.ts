export enum ReceiptStatus {
  PROCCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  ERROR = 'ERROR',
}

export type ReceiptEntity = {
  PK: string;
  SK: string;
  fileName: string;
  vendor: string;
  total: number;
  currency: string;
  date: string;
  items: string[];
  createdAt: string;
  status: ReceiptStatus;
  rawText?: string;
};

export type ReceiptAIResponse = Pick<
  ReceiptEntity,
  'vendor' | 'total' | 'currency' | 'date' | 'items'
>;
