import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  createResponse,
  createUnAuthorizedResponse,
} from '../../../utils/createResponse';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../../shared/aws-clients';
import { ReceiptEntity } from '../../../shared/types';

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims['sub'];
  if (!userId) return createUnAuthorizedResponse();

  const pk = `USER#${userId}`;

  try {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      Limit: 20,
      ScanIndexForward: false,
    });

    const result = await docClient.send(command);
    const items = (result.Items ?? []) as ReceiptEntity[];

    const formatted = items.map((item) => ({
      ...item,
      id: item.SK.replace('RECEIPT#', ''),
    }));

    return createResponse(200, { items: formatted });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createResponse(500, { message });
  }
};
