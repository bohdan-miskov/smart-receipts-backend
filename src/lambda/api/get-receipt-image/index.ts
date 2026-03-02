import { APIGatewayProxyHandler } from 'aws-lambda';
import { getUserId } from '../../../utils/getUserId';
import {
  createResponse,
  createServerErrorResponse,
  createUnAuthorizedResponse,
} from '../../../utils/createResponse';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '../../../shared/aws-clients';

const BUCKET_NAME = process.env.BUCKET_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const pk = getUserId(event);
  if (!pk) return createUnAuthorizedResponse();

  try {
    const receiptId = event.pathParameters?.id;

    if (!receiptId) {
      return createResponse(400, 'Receipt ID is missing in URL');
    }

    const s3Key = `uploads/${pk}/${receiptId}.jpg`;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    const signedUrl = getSignedUrl(s3Client, command, { expiresIn: 900 });

    return createResponse(200, 'Presigned URL generated successfully', {
      url: signedUrl,
    });
  } catch (error) {
    console.error(error);
    return createServerErrorResponse(error);
  }
};
