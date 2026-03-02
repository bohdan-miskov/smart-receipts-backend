import { APIGatewayProxyHandler } from 'aws-lambda';
import { getUserId } from '../../../utils/getUserId';
import {
  createResponse,
  createServerErrorResponse,
  createUnAuthorizedResponse,
} from '../../../utils/createResponse';
import { docClient } from '../../../shared/aws-clients';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_CURRENCY,
  DEFAULT_LANGUAGE_CODE,
  USER_PROFILE_SK,
} from '../../../shared/constants';

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const pk = getUserId(event);
  if (!pk) return createUnAuthorizedResponse();

  const sk = USER_PROFILE_SK;

  try {
    if (event.httpMethod === 'GET') {
      const { Item } = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk },
        }),
      );

      let profileData;

      if (!Item) {
        profileData = {
          language: DEFAULT_LANGUAGE_CODE,
          currency: DEFAULT_CURRENCY,
        };
      } else {
        const { PK, SK, ...rest } = Item;
        profileData = rest;
      }

      return createResponse(200, 'Profile data successfully found', {
        profile: profileData,
      });
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body ?? '{}');

      const newProfile = {
        PK: pk,
        SK: sk,
        language: body.language ?? DEFAULT_LANGUAGE_CODE,
        currency: body.currency ?? DEFAULT_CURRENCY,
        updatedAt: new Date().toISOString(),
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: newProfile,
        }),
      );

      const { PK, SK, ...profileData } = newProfile;
      return createResponse(200, 'Profile updated successfully', {
        profile: profileData,
      });
    }

    return createResponse(405, 'Method Not Allowed');
  } catch (error) {
    console.error('Error:', error);
    return createServerErrorResponse(error);
  }
};
