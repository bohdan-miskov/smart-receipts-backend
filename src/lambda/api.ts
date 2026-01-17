import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { ReceiptEntity } from '../types/schema';

const s3 = new S3Client({});
const db = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(db);

const BUCKET_NAME = process.env.BUCKET_NAME!;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'Get, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { httpMethod, path } = event;

    if (httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (httpMethod === 'GET' && path.endsWith('/receipts')) {
      const data = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': 'USER#demo',
          },
          Limit: 20,
        }),
      );

      const items = (data.Items ?? []) as unknown as ReceiptEntity[];

      const formattedItems = items.map((item) => {
        const { SK, PK, ...rest } = item;

        return {
          ...rest,
          id: SK.replace('RECEIPT#', ''),
        };
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          items: formattedItems ?? [],
        }),
      };
    }

    if (httpMethod === 'POST' && path.endsWith('/upload-url')) {
      const fileId = crypto.randomUUID();
      const key = `uploads/${fileId}.jpg`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: 'image/jpeg',
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          uploadUrl: uploadUrl,
          key: key,
        }),
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'Method not found' }),
    };
  } catch (error: unknown) {
    console.error(error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message,
        error: error,
      }),
    };
  }
};
