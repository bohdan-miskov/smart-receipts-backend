import {
  StartTranscriptionJobCommand,
  TranscribeClient,
} from '@aws-sdk/client-transcribe';
import { S3Handler } from 'aws-lambda';

const transcribe = new TranscribeClient({});
const BUCKET_NAME = process.env.BUCKET_NAME!;

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    try {
      const s3Key = decodeURIComponent(
        record.s3.object.key.replace(/\+/g, ' '),
      );

      if (!s3Key.startsWith('audio/')) {
        console.log(`Skipping non-audio file: ${s3Key}`);
        continue;
      }

      const fileName = s3Key.split('/').pop() || '';
      const receiptId = fileName.split('.')[0];

      const jobName = `job-${receiptId}-${Date.now()}`;
      const mediaUrl = `s3://${BUCKET_NAME}/${s3Key}`;

      const command = new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        Media: { MediaFileUri: mediaUrl },
        IdentifyLanguage: true,
        OutputBucketName: BUCKET_NAME,
        OutputKey: `transcripts/${receiptId}.json`,
      });

      await transcribe.send(command);
      console.log(
        `Started transcription job: ${jobName} for receipt: ${receiptId}`,
      );
    } catch (error) {
      console.error('Error starting transcription job:', error);
    }
  }
};
