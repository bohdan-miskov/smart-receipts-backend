import { Context, S3Event } from 'aws-lambda';
import {
  bedrockClient,
  docClient,
  textractClient,
} from '../../../shared/aws-clients';
import { AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  ReceiptAIResponse,
  ReceiptEntity,
  ReceiptStatus,
} from '../../../shared/types';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.TABLE_NAME!;

const PARSER_SYSTEM_PROMPT = `You are a specialized receipt parser. 
Analyze the text and extract data into JSON:
{ "vendor": string, "date": "YYYY-MM-DD", "total": number, "currency": string, "items": string[] }.
Output ONLY JSON.`;

export const handler = async (event: S3Event, context: Context) => {
  const record = event.Records[0];
  if (!record) return;

  const bucketName = record.s3.bucket.name;
  const fileName = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  console.log(`Processing: ${fileName}`);

  const pathParts = fileName.split('/');
  const userId =
    pathParts.length > 2 ? (pathParts[1] as string) : 'UNKNOWN_USER';
  const shortName = pathParts[pathParts.length - 1] as string;

  try {
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

    const responseBody = JSON.parse(new TextDecoder().decode(bedrockRes.body));
    const aiData = JSON.parse(
      responseBody.content[0].text,
    ) as ReceiptAIResponse;

    const receiptId = `RECEIPT#${Date.now()}`;
    const item: ReceiptEntity = {
      PK: userId,
      SK: receiptId,
      fileName: shortName,
      vendor: aiData.vendor ?? 'Unknown',
      total: aiData.total,
      currency: aiData.currency ?? 'USD',
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
};
