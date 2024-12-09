#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LexBedrockAgentKbStack } from '../lib/lex-bedrock-agent-kb-stack';
import {AwsSolutionsChecks} from "cdk-nag";
import {NagSuppressions} from "cdk-nag";

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

const app = new cdk.App();

cdk.Aspects.of(app).add(new AwsSolutionsChecks({verbose: true}));

const s3DataSourceStack = new cdk.Stack(app, 's3DataSourceStack', {
  env // to overcome cross-environment error from creating a stack that is Region/Account-agnostic
});

const dataSourceBucket = new cdk.aws_s3.Bucket(s3DataSourceStack, 's3DataSourceBucket', {
  bucketName: `s3-data-source-${cdk.Stack.of(s3DataSourceStack).account}`,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
  enforceSSL: true
});
new cdk.aws_s3_deployment.BucketDeployment(s3DataSourceStack, 's3DeployFiles', {
  sources: [cdk.aws_s3_deployment.Source.asset('./sample_data')],
  destinationBucket: dataSourceBucket,
});

NagSuppressions.addStackSuppressions(
  s3DataSourceStack,
  [
    {
      id: 'AwsSolutions-S1',
      reason: 'There is no need to enable access logging for the data source bucket.',
    },
    {
      id: 'AwsSolutions-IAM5',
      reason: 'Acceptable risk with The IAM entity contains wildcard permissions',
    },
    {
      id: 'AwsSolutions-IAM4',
      reason: 'Acceptable risk with The IAM entity contains wildcard permissions',
    },
    {
      id: 'AwsSolutions-L1',
      reason: 'Acceptable risk with The Lambda function is unencrypted',
    }
  ],
  true,
);

new LexBedrockAgentKbStack(app, 'LexBedrockAgentKbStack', {
  bedrockKnowledgeS3Datasource: dataSourceBucket,
  env
}).addDependency(s3DataSourceStack);