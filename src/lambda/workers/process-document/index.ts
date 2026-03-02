import { Context, S3Event } from 'aws-lambda';
import {
  bedrockClient,
  docClient,
  rekognitionClient,
  textractClient,
  translateClient,
} from '../../../shared/aws-clients';
import { AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  ReceiptAIResponse,
  ReceiptEntity,
  ReceiptStatus,
} from '../../../shared/types';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  Categories,
  CATEGORY_VALUES,
  DEFAULT_CURRENCY,
  DEFAULT_LANGUAGE_CODE,
  RECEIPT_POSSIBLE_TAGS,
  RECEIPT_SK_PREFIX,
  RECEIPT_TRANSLATION_FIELDS,
  USER_PROFILE_SK,
} from '../../../shared/constants';
import {
  DetectLabelsCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';
import { TranslateTextCommand } from '@aws-sdk/client-translate';

const TABLE_NAME = process.env.TABLE_NAME!;

const PARSER_SYSTEM_PROMPT = `Analyze the text extracted from this receipt. 
      Extract the following information and return it in strict JSON format exactly as shown below:
      {
        "vendor": "Name of the store or service",
        "total": 123.45,
        "date": "YYYY-MM-DD",
        "currency": "Standard 3-letter currency code (e.g., UAH, USD, EUR)",
        "category": "Classify the expense into exactly ONE of these categories: ${CATEGORY_VALUES.join(', ')}",
        "detectedLanguage": The ISO 639-1 two-letter code of the primary language on the receipt (e.g., 'uk' for Ukrainian, 'pl' for Polish, 'en' for English).
      }
      Important rules:
      - The "total" must be a number, not a string.
      - If you cannot find a value, use null.
      - Return ONLY the raw JSON object, without any markdown formatting, markdown blocks, or introductory text.
    `;

export const handler = async (event: S3Event, context: Context) => {
  for (const record of event.Records) {
    if (!record) continue;

    const s3Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const bucketName = record.s3.bucket.name;
    const fileName = decodeURIComponent(
      record.s3.object.key.replace(/\+/g, ' '),
    );
    console.log(`Processing: ${fileName}`);

    const pathParts = fileName.split('/');
    const userId =
      pathParts.length > 2 ? (pathParts[1] as string) : 'UNKNOWN_USER';
    const shortName = pathParts[pathParts.length - 1] as string;

    try {
      console.log('Checking image with Rekognition...');
      const rekognitionCommand = new DetectLabelsCommand({
        Image: { S3Object: { Bucket: bucketName, Name: s3Key } },
        MaxLabels: 10,
        MinConfidence: 70,
      });

      const labelsResponse = await rekognitionClient.send(rekognitionCommand);
      const labels =
        labelsResponse.Labels?.map((l) => String(l.Name?.toLowerCase())) ?? [];

      const isReceipt = labels.some((label) =>
        RECEIPT_POSSIBLE_TAGS.includes(label),
      );

      if (!isReceipt) {
        console.log(
          `Aborted: Image ${s3Key} does not look like a receipt. Labels found: ${labels.join(', ')}`,
        );

        continue;
      }

      console.log('Validation passed. Processing to text extraction...');

      const textractRes = await textractClient.send(
        new AnalyzeDocumentCommand({
          Document: { S3Object: { Bucket: bucketName, Name: fileName } },
          FeatureTypes: ['FORMS'],
        }),
      );

      const rawText =
        textractRes.Blocks?.filter((b) => b.BlockType === 'LINE')
          .map((b) => b.Text)
          .join('\n') || '';

      const { Item: profile } = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: userId, SK: USER_PROFILE_SK },
        }),
      );

      const targetLanguage = profile?.language ?? DEFAULT_LANGUAGE_CODE;
      console.log(`User preferred language: ${targetLanguage}`);

      const bedrockRes = await bedrockClient.send(
        new InvokeModelCommand({
          modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            system: PARSER_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: rawText }],
            max_tokens: 1000,
          }),
        }),
      );

      const responseBody = JSON.parse(
        new TextDecoder().decode(bedrockRes.body),
      );
      const aiData = JSON.parse(
        responseBody.content[0].text,
      ) as ReceiptAIResponse;

      const receiptLanguage = aiData.detectedLanguage ?? 'auto';

      if (aiData.detectedLanguage !== targetLanguage) {
        console.log(`Translating receipt...`);
        for (const key of RECEIPT_TRANSLATION_FIELDS) {
          const field = aiData[key];
          const fieldIsArray = Array.isArray(field);
          if (field && (typeof field == 'string' || fieldIsArray)) {
            const ARRAY_SEPARATOR = ';\n';
            const text = Array.isArray(field)
              ? field.join(ARRAY_SEPARATOR)
              : String(field);
            console.log(`Translating receipt ${key}: ${text}...`);
            const translateCommand = new TranslateTextCommand({
              Text: text,
              SourceLanguageCode: receiptLanguage,
              TargetLanguageCode: targetLanguage,
            });

            const translateResponse =
              await translateClient.send(translateCommand);
            if (typeof translateResponse.TranslatedText === 'string') {
              const translatedText = fieldIsArray
                ? translateResponse.TranslatedText.split(ARRAY_SEPARATOR)
                : translateResponse.TranslatedText;

              (aiData as any)[key] =
                translatedText as (typeof aiData)[typeof key];
              console.log(`Translated to: ${aiData[key]}`);
            }
          }
        }
      } else {
        console.log(
          'Skipping translation. Receipt is already in user preferred language.',
        );
      }

      const receiptId = `${Date.now()}`;

      const receiptDate = aiData.date ?? new Date().toISOString().split('T')[0];
      const smartSK = `${RECEIPT_SK_PREFIX}${receiptDate}#${receiptId}`;

      const item: ReceiptEntity = {
        PK: userId,
        SK: smartSK,
        id: receiptId,
        fileName: shortName,
        vendor: aiData.vendor,
        total: aiData.total,
        currency: aiData.currency ?? DEFAULT_CURRENCY,
        category: aiData.category ?? Categories.Other,
        date: aiData.date ?? new Date().toISOString(),
        items: aiData.items ?? [],
        rawText: rawText,
        status: ReceiptStatus.PROCESSED,
        createdAt: new Date().toISOString(),
        s3Path: `s3://${bucketName}/${fileName}`,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        }),
      );

      console.log(`Saved receipt: ${receiptId}`);
    } catch (error) {
      console.error('Error', error);
    }
  }
};
