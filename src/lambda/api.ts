import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APIGatewayProxyHandler } from 'aws-lambda';

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
    const method = event.httpMethod;

    if (method === 'GET') {
      const data = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          Limit: 20,
        }),
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          data: data.Items ?? [],
        }),
      };
    }

    if (method === 'POST') {
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
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Method not supported' }),
    };
  } catch (error: unknown) {
    console.error(error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message,
        data: error,
      }),
    };
  }
};
