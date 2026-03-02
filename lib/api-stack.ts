import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { DatabaseStack } from './database-stack';
import { StorageStack } from './storage-stack';
import { AuthStack } from './auth-stack';

interface ApiStackProps extends cdk.StackProps {
  dbStack: DatabaseStack;
  storageStack: StorageStack;
  authStack: AuthStack;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { table } = props.dbStack;
    const { uploadBucket } = props.storageStack;
    const { userPool } = props.authStack;

    const commonEnv = {
      TABLE_NAME: table.tableName,
      BUCKET_NAME: uploadBucket.bucketName,
      REGION: this.region,
    };

    const processorLambda = new nodejs.NodejsFunction(
      this,
      'ReceiptProcessor',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          '../src/lambda/workers/process-document/index.ts',
        ),
        handler: 'handler',
        environment: commonEnv,
        timeout: cdk.Duration.seconds(60),
        bundling: {
          minify: true,
          sourceMap: true,
        },
      },
    );

    uploadBucket.grantRead(processorLambda);
    // uploadBucket.addEventNotification(
    //   cdk.aws_s3.EventType.OBJECT_CREATED,
    //   new s3n.LambdaDestination(processorLambda),
    //   { prefix: 'uploads/' },
    // );

    const importedBucket = cdk.aws_s3.Bucket.fromBucketAttributes(
      this,
      'ImportedUploadBucket',
      {
        bucketArn: uploadBucket.bucketArn,
        bucketName: uploadBucket.bucketName,
      },
    );

    importedBucket.addEventNotification(
      cdk.aws_s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processorLambda),
      { prefix: 'uploads/' },
    );

    table.grantWriteData(processorLambda);

    processorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'textract:AnalyzeDocument',
          'bedrock:InvokeModel',
          'rekognition:DetectLabels',
          'translate:TranslateText',
        ],
        resources: ['*'],
      }),
    );

    const startTranscriptionLambda = new nodejs.NodejsFunction(
      this,
      'StartTranscriptionWorker',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          '../src/lambda/workers/start-transcription/index.ts',
        ),
        environment: commonEnv,
      },
    );
    uploadBucket.grantRead(startTranscriptionLambda);
    startTranscriptionLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['transcribe:StartTranscriptionJob'],
        resources: ['*'],
      }),
    );

    importedBucket.addEventNotification(
      cdk.aws_s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(startTranscriptionLambda),
      { prefix: 'audio/' },
    );

    const saveTranscriptionLambda = new nodejs.NodejsFunction(
      this,
      'SaveTranscriptionWorker',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          '../src/lambda/workers/save-transcription/index.ts',
        ),
        environment: commonEnv,
      },
    );

    uploadBucket.grantRead(saveTranscriptionLambda);
    table.grantWriteData(saveTranscriptionLambda);

    saveTranscriptionLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['comprehend:DetectSentiment', 'comprehend:DetectEntities'],
        resources: ['*'],
      }),
    );

    importedBucket.addEventNotification(
      cdk.aws_s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(saveTranscriptionLambda),
      { prefix: 'transcripts/', suffix: '.json' },
    );

    // API ENDPOINTS (REST API)

    const uploadUrlLambda = new nodejs.NodejsFunction(
      this,
      'UploadUrkHandler',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          '../src/lambda/api/generate-upload-url/index.ts',
        ),
        environment: commonEnv,
      },
    );
    uploadBucket.grantPut(uploadUrlLambda);

    const getReceiptsLambda = new nodejs.NodejsFunction(
      this,
      'GetReceiptsHandler',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, '../src/lambda/api/get-receipts/index.ts'),
        environment: commonEnv,
      },
    );
    table.grantReadData(getReceiptsLambda);

    const getStatsLambda = new nodejs.NodejsFunction(this, 'GetStatsHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/api/get-stats/index.ts'),
      environment: commonEnv,
    });
    table.grantReadData(getStatsLambda);

    const updateReceiptLambda = new nodejs.NodejsFunction(
      this,
      'UpdateReceiptHandler',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          '../src/lambda/api/update-receipt/index.ts',
        ),
        environment: commonEnv,
      },
    );
    table.grantWriteData(updateReceiptLambda);

    const deleteReceiptLambda = new nodejs.NodejsFunction(
      this,
      'DeleteReceiptHandler',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          '../src/lambda/api/delete-receipt/index.ts',
        ),
        environment: commonEnv,
      },
    );
    table.grantWriteData(deleteReceiptLambda);
    uploadBucket.grantDelete(deleteReceiptLambda);

    const getReceiptImageLambda = new nodejs.NodejsFunction(
      this,
      'GetReceiptImageHandler',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          __dirname,
          '../src/lambda/api/get-receipt-image/index.ts',
        ),
        environment: commonEnv,
      },
    );
    uploadBucket.grantRead(getReceiptImageLambda);

    const profileLambda = new nodejs.NodejsFunction(this, 'ProfileHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/api/profile/index.ts'),
      environment: commonEnv,
    });
    table.grantReadWriteData(profileLambda);

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'ApiAuthorizer',
      {
        cognitoUserPools: [userPool],
      },
    );

    // API GATEWAY CONFIGURATION

    const api = new apigateway.RestApi(this, 'SmartReceiptsApi', {
      restApiName: 'Smart Receipts Service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const receiptsResource = api.root.addResource('receipts');
    receiptsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getReceiptsLambda),
      { authorizer },
    );

    const singleReceiptResource = receiptsResource.addResource('{id}');
    singleReceiptResource.addMethod(
      'PATCH',
      new apigateway.LambdaIntegration(updateReceiptLambda),
      { authorizer },
    );
    singleReceiptResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(deleteReceiptLambda),
      { authorizer },
    );

    const imageResource = singleReceiptResource.addResource('image');
    imageResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getReceiptImageLambda),
      { authorizer },
    );

    const statsResource = api.root.addResource('stats');
    statsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getStatsLambda),
      { authorizer },
    );

    const uploadUrlResource = api.root.addResource('upload-url');
    uploadUrlResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(uploadUrlLambda),
      { authorizer },
    );

    const profileResource = api.root.addResource('profile');
    profileResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(profileLambda),
      { authorizer },
    );
    profileResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(profileLambda),
      { authorizer },
    );

    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
  }
}
