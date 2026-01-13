import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  AnalyzeDocumentCommand,
  TextractClient,
} from '@aws-sdk/client-textract';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Context, S3Event } from 'aws-lambda';

const textractClient = new TextractClient({});
const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (event: S3Event, context: Context) => {
  console.log('Processing event...');

  const record = event.Records[0];
  if (!record) return;

  const bucketName = record.s3.bucket.name;

  // Імена файлів в S3 URL-кодовані (пробіл = %20)
  const fileName = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  console.log(`Analyzing file: ${fileName} from bucket: ${bucketName}`);

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
      textractResponse.Blocks?.filter(
        (block) => block.BlockType === 'LINE',
      ).map((block) => block.Text) || [];

    console.log('Detected text:', detectedLines.join('\n'));

    // Створюю унікальнк id з назви і повної дати для унікальності
    const receiptId = fileName.split('/').pop() || Date.now().toString();

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#demo`,
          SK: `RECEIPT#${receiptId}`,
          fileName: fileName,
          detectedText: detectedLines,
          createdAt: new Date().toISOString(),
          status: 'PROCESSED',
        },
      }),
    );

    console.log('Successfully saved to DynamoDB');

    return { statusCode: 200, body: JSON.stringify({ message: 'Success' }) };
  } catch (error: unknown) {
    console.error('Error processing receipt:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      body: JSON.stringify({ message }),
    };
  }
};
