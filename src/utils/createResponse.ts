export const createUnAuthorizedResponse = (headers?: Record<string, string>) =>
  createResponse(
    401,
    {
      message: 'Unauthorized: missing or invalid credentials',
    },
    headers,
  );

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
