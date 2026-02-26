#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { DatabaseStack } from '../lib/database-stack';
import { StorageStack } from '../lib/storage-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import * as dotenv from 'dotenv';
import { OidcStack } from '../lib/oidc-stack';
import { BillingStack } from '../lib/billing-stack';
dotenv.config();

const app = new cdk.App();

const envName = process.env.APP_ENV || 'dev';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT as string,
  region: process.env.CDK_DEFAULT_REGION as string,
};

const dbStack = new DatabaseStack(app, `SmartReceiptDbStack-${envName}`, {
  env: env,
});
const storageStack = new StorageStack(
  app,
  `SmartReceiptStorageStack-${envName}`,
  { env },
);
const authStack = new AuthStack(app, `SmartReceiptsAuthStack-${envName}`, {
  env,
});

new ApiStack(app, `SmartReceiptsBackendStack-${envName}`, {
  env,
  dbStack,
  storageStack,
  authStack,
});

new OidcStack(app, `SmartReceiptsOidcStack`, { env });

new BillingStack(app, 'SmartReceiptsBillingStack', { env });

cdk.Tags.of(app).add('Environment', envName);
cdk.Tags.of(app).add('Project', 'SmartReceipts');
