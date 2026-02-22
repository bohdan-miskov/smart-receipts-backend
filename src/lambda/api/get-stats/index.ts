import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  createResponse,
  createUnAuthorizedResponse,
} from '../../../utils/createResponse';
import { ReceiptEntity } from '../../../shared/types';
import { docClient } from '../../../shared/aws-clients';

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.claims['sub'];

    if (!userId) {
      return createUnAuthorizedResponse();
    }

    const PK = `USER#${userId}`;

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
      const currency = item.currency || 'Unknown';
      const vendor = item.vendor || 'Unknown';

      if (currencyMap[currency]) {
        currencyMap[currency] += amount;
      } else {
        currencyMap[currency] = amount;
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
      } else {
        vendorMap[vendor] = amount;
      }
    });

    const currencyList = Object.entries(currencyMap).map(([code, amount]) => ({
      code,
      amount,
    }));

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

    return createResponse(200, {
      currencyList,
      receiptsCount: items.length,
      topVendors,
      chartData,
    });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createResponse(500, { message });
  }
};
