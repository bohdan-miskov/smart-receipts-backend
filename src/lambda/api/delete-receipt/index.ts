import { APIGatewayProxyHandler } from 'aws-lambda';
import { getUserId } from '../../../utils/getUserId';
import {
  createResponse,
  createServerErrorResponse,
  createUnAuthorizedResponse,
} from '../../../utils/createResponse';
import { docClient, s3Client } from '../../../shared/aws-clients';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

const BUCKET_NAME = process.env.BUCKET_NAME!;
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const pk = getUserId(event);
  if (!pk) createUnAuthorizedResponse();

  try {
    const receiptId = event.pathParameters?.id;

    if (!receiptId) {
      return createResponse(400, 'Receipt ID is missing in URL');
    }

    const sk = `RECEIPT#${receiptId}`;
    const s3Key = `uploads/${pk}/${receiptId}.jpg`;

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: sk },
      }),
    );

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      }),
    );

    return createResponse(204, 'Receipt successfully deleted');
  } catch (error) {
    console.error(error);
    return createServerErrorResponse(error);
  }
};
