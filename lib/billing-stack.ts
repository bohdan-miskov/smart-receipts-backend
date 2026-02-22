import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as budgets from 'aws-cdk-lib/aws-budgets';

export class BillingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const alertEmail = process.env.ALERT_EMAIL;

    if (!alertEmail) {
      console.warn(
        '⚠️ ALERT_EMAIL not found in env. Deploying without email notification.',
      );
      return;
    }

    new budgets.CfnBudget(this, 'ProjectBudget', {
      budget: {
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: 0.5,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 50,
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: alertEmail,
            },
          ],
        },
      ],
    });
  }
}
