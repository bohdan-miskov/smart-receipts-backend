import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  createResponse,
  createServerErrorResponse,
  createUnAuthorizedResponse,
} from '../../../utils/createResponse';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '../../../shared/aws-clients';
import { getUserId } from '../../../utils/getUserId';

const BUCKET_NAME = process.env.BUCKET_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const pk = getUserId(event);
  if (!pk) createUnAuthorizedResponse();

  try {
    const fieldId = crypto.randomUUID();

    const key = `uploads/${pk}/${fieldId}.jpg`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: 'image/jpeg',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return createResponse(200, 'Upload URL generated successfully', {
      uploadUrl,
      key,
    });
  } catch (error) {
    console.error('Error', error);
    return createServerErrorResponse(error);
  }
};
