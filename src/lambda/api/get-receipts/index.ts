import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  createResponse,
  createServerErrorResponse,
  createUnAuthorizedResponse,
} from '../../../utils/createResponse';
import { QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../../shared/aws-clients';
import { ReceiptEntity } from '../../../shared/types';
import { getUserId } from '../../../utils/getUserId';
import { RECEIPT_SK_PREFIX } from '../../../shared/constants';

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const pk = getUserId(event);
  if (!pk) return createUnAuthorizedResponse();

  const category = event.queryStringParameters?.category;
  const search = event.queryStringParameters?.search;

  try {
    const cursor = event.queryStringParameters?.cursor;

    let exclusiveStartKey = undefined;

    if (cursor) {
      try {
        const decodedString = Buffer.from(cursor, 'base64').toString('utf-8');
        exclusiveStartKey = JSON.parse(decodedString);
      } catch {
        return createResponse(400, 'Invalid cursor format');
      }
    }

    let filterExpression: string[] = [];
    let expressionAttributeValues: Record<string, any> = {
      ':pk': pk,
      ':skPrefix': RECEIPT_SK_PREFIX,
    };
    let expressionAttributeNames: Record<string, string> = {};

    if (category) {
      filterExpression.push('#category = :category');
      expressionAttributeValues[':category'] = category;
      expressionAttributeNames['#category'] = 'category';
    }

    if (search) {
      filterExpression.push(
        '(contains(#vendor, :search) OR contains(#tags, :search))',
      );
      expressionAttributeValues[':search'] = search;
      expressionAttributeNames['#vendor'] = 'vendor';
      expressionAttributeNames['#tags'] = 'tags';
    }

    const commandInput: QueryCommandInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: 20,
      ScanIndexForward: false,
      ExclusiveStartKey: exclusiveStartKey,
    };

    if (filterExpression.length > 0) {
      commandInput.FilterExpression = filterExpression.join(' AND ');
      commandInput.ExpressionAttributeNames = expressionAttributeNames;
    }

    const result = await docClient.send(new QueryCommand(commandInput));
    const items = (result.Items ?? []) as ReceiptEntity[];

    const formatted = items.map((item) => {
      const { PK, SK, ...rest } = item;
      return rest;
    });

    let nextCursor = null;
    if (result.LastEvaluatedKey) {
      nextCursor = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey),
      ).toString('base64');
    }

    return createResponse(200, 'Receipts found successfully', {
      items: formatted,
      count: formatted.length,
      nextCursor,
    });
  } catch (error) {
    console.error(error);
    return createServerErrorResponse(error);
  }
};
