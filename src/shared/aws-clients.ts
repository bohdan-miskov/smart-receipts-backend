import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { TextractClient } from '@aws-sdk/client-textract';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const dbClient = new DynamoDBClient({});
const s3Client = new S3Client({});
const textractClient = new TextractClient({});
const bedrockClient = new BedrockRuntimeClient({});

const docClient = DynamoDBDocumentClient.from(dbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export { s3Client, textractClient, bedrockClient, docClient };
