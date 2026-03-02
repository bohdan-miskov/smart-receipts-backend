const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export const createResponse = (
  code: number,
  message?: string,
  data?: object,
  headers?: Record<string, string | boolean>,
) => {
  const body = {
    message,
    data,
  };

  return {
    statusCode: code,
    headers: headers ?? DEFAULT_HEADERS,
    body: JSON.stringify(body),
  };
};

export const createServerErrorResponse = (error: any) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Unknown error';
  const data = typeof error === 'object' ? error : {};
  return createResponse(500, message, data);
};

export const createUnAuthorizedResponse = (headers?: Record<string, string>) =>
  createResponse(401, 'Unauthorized: missing or invalid credentials');
