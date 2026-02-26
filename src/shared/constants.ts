import { ReceiptAIResponse, TranslatableFields } from './types';

export enum Categories {
  Groceries = 'Groceries',
  Restaurants = 'Restaurants',
  Transport = 'Transport',
  Health = 'Health',
  Clothing = 'Clothing',
  Utilities = 'Utilities',
  Entertainment = 'Entertainment',
  Electronics = 'Electronics',
  Auto = 'Auto',
  Other = 'Other',
}

export const CATEGORY_VALUES = Object.values(Categories);

export const RECEIPT_POSSIBLE_TAGS = [
  'document',
  'receipt',
  'paper',
  'text',
  'invoice',
];

export const MAIN_INFO_TAGS = ['ORGANIZATION', 'LOCATION', 'COMMERCIAL_ITEM'];

export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_LANGUAGE_CODE = 'en';
export const USER_PROFILE_SK = 'PROFILE';

export const RECEIPT_SK_PREFIX = 'RECEIPT#';

export const RECEIPT_TRANSLATION_FIELDS = ['vendor', 'items'] as const;
