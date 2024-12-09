#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {AwsSolutionsChecks} from "cdk-nag";
import { BedrockKbStack } from '../lib/bedrock-kb-stack';
import { LexBotStack, LexBotStackProps } from '../lib/lex-bot-stack';
import { S3DataSourceStack } from '../lib/s3-datasource-stack';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

const app = new cdk.App();

// Apply CDK nag checks
cdk.Aspects.of(app).add(new AwsSolutionsChecks({verbose: true}));

const s3DataSourceStack = new S3DataSourceStack(app, 's3DataSourceStack', {
  env // to overcome cross-environment usage error from creating a stack that is Region/Account-agnostic
});

const bedrockKbStack = new BedrockKbStack(app, 'BedrockKbStack', {
  bedrockKnowledgeS3Datasource: s3DataSourceStack.s3Bucket,
  env // to overcome cross-environment error from creating a stack that is Region/Account-agnostic
});

const lexBotStack = new LexBotStack(app, 'LexBotStack', <LexBotStackProps>{
  bedrockAgentId: bedrockKbStack.bedrockAgent.agentId,
  bedrockAgentAliasId: bedrockKbStack.bedrockAgent.aliasId,
  env,
}).addDependency(bedrockKbStack);

app.synth();
