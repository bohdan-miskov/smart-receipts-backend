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
    );

    table.grantWriteData(processorLambda);

    processorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['textract:AnalyzeDocument', 'bedrock:InvokeModel'],
        resources: ['*'],
      }),
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

    new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.url });
  }
}
