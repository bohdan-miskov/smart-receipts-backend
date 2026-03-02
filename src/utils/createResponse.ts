export const createResponse = (
  code: number,
  message?: string,
  data?: object,
  headers?: Record<string, string>,
) => {
  const body = {
    message,
    data,
  };
  return {
    statusCode: code,
    headers,
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
