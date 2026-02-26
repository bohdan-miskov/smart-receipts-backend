import { APIGatewayProxyEvent } from 'aws-lambda';

export const getUserId = (event: APIGatewayProxyEvent): string | undefined => {
  const userId = event.requestContext.authorizer?.claims['sub'];
  if (!userId) return;
  return `USER#${userId}`;
};
