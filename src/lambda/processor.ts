import { Context, S3Event } from 'aws-lambda';

export const handler = async (event: S3Event, context: Context) => {
  console.log('Event received:', JSON.stringify(event, null, 2));

  const tableName = process.env.TABLE_NAME;
  const bucketName = process.env.BUCKET_NAME;

  if (event.Records && event.Records[0]) {
    const fileName = event.Records[0].s3.object.key;
    console.log(`Processing file: ${fileName}`);
  }

  console.log(`Config: Bucket=${bucketName}, Table=${tableName}`);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello from TypeScript Lambda!' }),
  };
};
