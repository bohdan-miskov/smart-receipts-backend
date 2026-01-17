import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  AnalyzeDocumentCommand,
  TextractClient,
} from '@aws-sdk/client-textract';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Context, S3Event } from 'aws-lambda';
import {
  ReceiptAIResponse,
  ReceiptEntity,
  ReceiptStatus,
} from '../types/schema';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const textractClient = new TextractClient({});
const bedrockClient = new BedrockRuntimeClient({});
const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

const TABLE_NAME = process.env.TABLE_NAME!;

const PARSER_SYSTEM_PROMPT = `You are a specialized receipt parser. 
      Analyze the text below and extract data into a strict JSON format.
      Required fields: 
      - vendor (string, store name)
      - date (string, ISO 8601 format YYYY-MM-DD, use current year if missing)
      - total (number, just the final amount)
      - currency (string, e.g., "USD", "EUR", "UAH")
      - items (array of strings, list of purchased items with amount)
      
      Output ONLY the JSON object. No markdown, no explanations.`;

export const handler = async (event: S3Event, context: Context) => {
  console.log('Processing event...');

  const record = event.Records[0];
  if (!record) return;

  const bucketName = record.s3.bucket.name;

  // Імена файлів в S3 URL-кодовані (пробіл = %20)
  const fileName = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  console.log(`Analyzing file: ${fileName} from bucket: ${bucketName}`);

  const pathParts = fileName.split('/');

  let userId;
  let cleanFileName = fileName;
  if (pathParts.length > 2) {
    userId = pathParts[1];
    cleanFileName = pathParts[pathParts.length - 1] ?? 'unknown';
  }

  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: 'Unauthorized: missing or invalid credentials',
      }),
    };
  }

  try {
    const textractCommand = new AnalyzeDocumentCommand({
      Document: {
        S3Object: {
          Bucket: bucketName,
          Name: fileName,
        },
      },
      FeatureTypes: ['FORMS'], // FORMS змушує AI шукати пари "Ключ: Значення" (наприклад "Total: 100")
    });

    const textractResponse = await textractClient.send(textractCommand);

    // Textract повертає складний JSON з координатами. Проекту достатньо просто зібрати всі рядки тексту.
    const detectedLines =
      textractResponse.Blocks?.filter((block) => block.BlockType === 'LINE')
        .map((block) => block.Text)
        .join('\n') ?? '';

    const bedrockCommand = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        system: PARSER_SYSTEM_PROMPT,
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: 'Receipt Text: ' + detectedLines,
          },
        ],
      }),
    });

    const bedrockResponse = await bedrockClient.send(bedrockCommand);

    const responseBody = new TextDecoder().decode(bedrockResponse.body);
    const result = JSON.parse(responseBody);
    const parsedText = result.content[0].text;

    console.log('AI Response:', parsedText);

    let receiptData: ReceiptAIResponse;
    let status: ReceiptStatus;

    try {
      receiptData = JSON.parse(parsedText);
      status = ReceiptStatus.PROCESSED;
    } catch {
      receiptData = {
        vendor: 'Unknown',
        currency: '',
        total: 0,
        items: [],
        date: new Date().toISOString(),
      };
      status = ReceiptStatus.ERROR;
    }

    // Створюю унікальнк id з назви і повної дати для унікальності
    const currentISODate = new Date().toISOString();
    const receiptId = `${cleanFileName}_${currentISODate}`;
    const item: ReceiptEntity = {
      PK: userId,
      SK: `RECEIPT#${receiptId}`,
      fileName: fileName,
      vendor: receiptData.vendor ?? 'Unknown',
      total: receiptData.total ?? 0,
      currency: receiptData.currency ?? 'USD',
      date: receiptData.date ?? currentISODate,
      items: receiptData.items ?? [],
      rawText: detectedLines,
      createdAt: currentISODate,
      status: status,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }),
    );

    console.log('Successfully saved to DynamoDB');

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Success',
      }),
    };
  } catch (error: unknown) {
    console.error('Error processing receipt:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      body: JSON.stringify({ message }),
    };
  }
};
