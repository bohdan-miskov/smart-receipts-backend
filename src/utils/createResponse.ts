export const createResponse = (
  code: number,
  body: object,
  headers?: Record<string, string>,
) => {
  return {
    statusCode: code,
    headers,
    body: JSON.stringify(body),
  };
};

export const createServerErrorResponse = (error: any) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Unknown error';
  return createResponse(500, { message });
};

export const createUnAuthorizedResponse = (headers?: Record<string, string>) =>
  createResponse(
    401,
    {
      message: 'Unauthorized: missing or invalid credentials',
    },
    headers,
  );
