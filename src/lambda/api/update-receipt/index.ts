import { APIGatewayProxyHandler } from 'aws-lambda';
import { getUserId } from '../../../utils/getUserId';
import {
  createResponse,
  createServerErrorResponse,
  createUnAuthorizedResponse,
} from '../../../utils/createResponse';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../../shared/aws-clients';

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const pk = getUserId(event);

  if (!pk) return createUnAuthorizedResponse();

  try {
    const receiptId = event.pathParameters?.id;
    if (!receiptId || !event.body) {
      return createResponse(400, 'Missing ID or request body');
    }

    const body = JSON.parse(event.body);
    const sk = `RECEIPT#${receiptId}`;

    const allowedFields = ['vendor', 'total', 'date', 'currency'];

    const updateParts: string[] = [];
    const expressionNames: Record<string, string> = {};
    const expressionValues: Record<string, any> = {};

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateParts.push(`#${field} = :${field}`);
        expressionNames[`#${field}`] = field;
        expressionValues[`:${field}`] = body[field];
      }
    });

    if (updateParts.length === 0) {
      return createResponse(400, 'No valid fields provided for update');
    }

    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(command);
    const updatedItem = result.Attributes || {};

    return createResponse(200, 'Receipt successfully updated', {
      item: {
        ...updatedItem,
        id: receiptId,
      },
    });
  } catch (error) {
    console.error(error);
    return createServerErrorResponse(error);
  }
};
