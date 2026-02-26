import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  createResponse,
  createUnAuthorizedResponse,
} from '../../../utils/createResponse';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '../../../shared/aws-clients';

const BUCKET_NAME = process.env.BUCKET_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims['sub'];
  if (!userId) createUnAuthorizedResponse();

  try {
    const fieldId = crypto.randomUUID();

    const key = `uploads/USER#${userId}/${fieldId}.jpg`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: 'image/jpeg',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return createResponse(200, {
      uploadUrl,
      key,
    });
  } catch (error) {
    console.error('Error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return createResponse(500, { message });
  }
};
