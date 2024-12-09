#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {AwsSolutionsChecks} from "cdk-nag";
import { S3DataSourceStack } from '../lib/s3-datasource-stack';
import { BedrockKbConstruct } from '../lib/constructs/bedrock-agent-kb/bedrock-kb-construct';
import { LexBotConstruct } from '../lib/constructs/lex-bot/lex-bot-construct';

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

// Create the Bedrock KB construct
const bedrockKb = new BedrockKbConstruct(new cdk.Stack(app, 'bedrockStack'), 'BedrockKb', {
  knowledgebaseDataSourceName: 'gutendex-s3-datasource',
  bedrockKnowledgeS3Datasource: s3DataSourceStack.s3Bucket
});

// Create the Lex Bot construct
const lexBot = new LexBotConstruct(new cdk.Stack(app, 'LexBotStack'), 'LexBot', {
  bedrockAgentId: bedrockKb.bedrockAgent.agentId,
  bedrockAgentAliasId: bedrockKb.agentAlias.aliasId,
});

app.synth();
