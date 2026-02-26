import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { ComprehendClient } from '@aws-sdk/client-comprehend';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { S3Client } from '@aws-sdk/client-s3';
import { TextractClient } from '@aws-sdk/client-textract';
import { TranslateClient } from '@aws-sdk/client-translate';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const dbClient = new DynamoDBClient({});
const s3Client = new S3Client({});
const textractClient = new TextractClient({});
const bedrockClient = new BedrockRuntimeClient({});
const translateClient = new TranslateClient({});
const rekognitionClient = new RekognitionClient({});
const comprehendClient = new ComprehendClient({});

const docClient = DynamoDBDocumentClient.from(dbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export {
  s3Client,
  textractClient,
  bedrockClient,
  docClient,
  rekognitionClient,
  translateClient,
  comprehendClient,
};
