import { S3Handler } from 'aws-lambda';
import {
  comprehendClient,
  docClient,
  s3Client,
} from '../../../shared/aws-clients';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { buffer } from 'stream/consumers';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  DetectEntitiesCommand,
  DetectSentimentCommand,
  LanguageCode,
} from '@aws-sdk/client-comprehend';
import { MAIN_INFO_TAGS } from '../../../shared/constants';

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ''));

      const getObjectResult = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const bodyString = await getObjectResult.Body?.transformToString();
      if (!bodyString) continue;

      const transcribeData = JSON.parse(bodyString);

      const transcriptText =
        transcribeData.results?.transcripts?.[0]?.transcript;

      if (!transcriptText) {
        console.log('No text found in transcription.');
        continue;
      }

      console.log(`Analyzing text with Comprehend: "${transcriptText}"`);

      const languageCode = LanguageCode.EN;

      const [sentimentResponse, entitiesResponse] = await Promise.all([
        comprehendClient.send(
          new DetectSentimentCommand({
            Text: transcriptText,
            LanguageCode: languageCode,
          }),
        ),
        comprehendClient.send(
          new DetectEntitiesCommand({
            Text: transcriptText,
            LanguageCode: languageCode,
          }),
        ),
      ]);

      const sentiment = sentimentResponse.Sentiment;

      const tags =
        entitiesResponse.Entities?.filter((e) =>
          MAIN_INFO_TAGS.includes(e.Type ?? ''),
        )?.map((e) => e.Text) ?? [];

      const uniqueTags = [...new Set(tags)];

      const parts = key.split('/');
      const pk = parts[1];
      const sk = parts[2]?.replace('.json', '');

      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk },
          UpdateExpression:
            'SET audioDescription = :text, sentiment = :sentiment, tags = :tags',
          ExpressionAttributeValues: {
            ':text': transcriptText,
            ':sentiment': sentiment,
            ':tags': uniqueTags,
          },
        }),
      );

      console.log(
        `Successfully added audio description "${transcriptText}" to ${sk}. Sentiment: ${sentiment}`,
      );
    } catch (error) {
      console.error('Error saving transcription:', error);
    }
  }
};
