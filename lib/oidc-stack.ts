import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class OidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubDomain = 'token.actions.githubusercontent.com';

    const githubProvider =
      iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
        this,
        'ImportedGitHubProvider',
        `arn:aws:iam::${this.account}:oidc-provider/${githubDomain}`,
      );

    const githubRole = new iam.Role(this, 'GitHubActionsRole', {
      roleName: 'GitHubDeployRole',
      assumedBy: new iam.OpenIdConnectPrincipal(githubProvider).withConditions({
        StringLike: {
          [`${githubDomain}:sub`]:
            'repo:bohdan-miskov/smart-receipts-backend:*',
        },
        StringEquals: {
          [`${githubDomain}:aud`]: 'sts.amazonaws.com',
        },
      }),
    });

    githubRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
    );

    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', {
      value: githubRole.roleArn,
      description: 'ARN roles for GitHub Actions',
    });
  }
}
