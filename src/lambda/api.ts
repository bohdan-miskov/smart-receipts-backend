import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import { ReceiptEntity } from '../types/schema';
import {
  createResponse,
  createUnAuthorizedResponse,
} from '../utils/createResponse';

const s3 = new S3Client({});
const db = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(db);

const BUCKET_NAME = process.env.BUCKET_NAME!;
const TABLE_NAME = process.env.TABLE_NAME!;

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'Get, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const getUserId = (event: APIGatewayProxyEvent): string | undefined => {
  const userId = event.requestContext.authorizer?.claims['sub'];

  if (!userId) {
    return;
  }

  return `USER#${userId}`;
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { httpMethod, path } = event;

    if (httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: HEADERS, body: '' };
    }

    if (httpMethod === 'GET' && path.endsWith('/receipts')) {
      const PK = getUserId(event);

      if (!PK) {
        return createUnAuthorizedResponse(HEADERS);
      }

      const data = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': PK,
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

      return createResponse(
        200,
        {
          items: formattedItems ?? [],
        },
        HEADERS,
      );
    }

    if (httpMethod === 'GET' && path.endsWith('/stats')) {
      const PK = getUserId(event);

      if (!PK) {
        return createUnAuthorizedResponse(HEADERS);
      }

      const command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': PK,
        },
        ProjectionExpression: '#total, vendor, #date, currency',
        ExpressionAttributeNames: { '#date': 'date', '#total': 'total' },
      });

      type ReceiptShortInfo = Pick<
        ReceiptEntity,
        'total' | 'vendor' | 'date' | 'currency'
      >;

      const response = await docClient.send(command);
      const items = (response.Items || []) as ReceiptShortInfo[];

      const currencyMap: Record<string, number> = {};
      const monthlyData: Record<string, number> = {};
      const vendorMap: Record<string, number> = {};

      items.forEach((item) => {
        const amount = Number(item.total) || 0;
        const currency = item.currency;
        const vendor = item.vendor || 'Unknown';

        if (currency) {
          if (currencyMap[currency]) {
            currencyMap[currency] += amount;
          } else {
            currencyMap[currency] = amount;
          }
        }

        const dateObj = new Date(item.date);
        const monthKey = `${dateObj.getFullYear()}-${String(
          dateObj.getMonth() + 1,
        ).padStart(2, '0')}`;

        if (monthlyData[monthKey]) {
          monthlyData[monthKey] += amount;
        } else {
          monthlyData[monthKey] = amount;
        }

        if (vendorMap[vendor]) {
          vendorMap[vendor] += amount;
        } else vendorMap[vendor] = amount;
      });

      const currencyList = Object.entries(currencyMap).map(
        ([code, amount]) => ({
          code,
          amount,
        }),
      );

      const chartData = Object.entries(monthlyData)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const topVendors = Object.entries(vendorMap)
        .map(([name, amount]) => ({
          name,
          amount,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      return createResponse(
        200,
        {
          currencyList,
          receiptsCount: items.length,
          topVendors,
          chartData,
        },
        HEADERS,
      );
    }

    if (httpMethod === 'POST' && path.endsWith('/upload-url')) {
      const PK = getUserId(event);

      if (!PK) {
        return createUnAuthorizedResponse(HEADERS);
      }

      const fileId = crypto.randomUUID();
      const key = `uploads/${PK}/${fileId}.jpg`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: 'image/jpeg',
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

      return createResponse(
        200,
        {
          uploadUrl: uploadUrl,
          key: key,
        },
        HEADERS,
      );
    }

    return createResponse(404, { message: 'Method not found' }, HEADERS);
  } catch (error: unknown) {
    console.error(error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    return createResponse(
      500,
      {
        message,
        error: error,
      },
      HEADERS,
    );
  }
};
