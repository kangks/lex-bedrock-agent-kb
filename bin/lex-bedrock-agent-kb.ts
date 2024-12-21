#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {AwsSolutionsChecks} from "cdk-nag";
import { S3DataSourceStack } from '../lib/s3-datasource-stack';
import { BedrockKbConstruct } from '../lib/constructs/bedrock-agent-kb/bedrock-kb-construct';
import { LexBotConstruct } from '../lib/constructs/lex-bot/lex-bot-construct';
import appConfig from '../app-config.json';
import { BedrockAgentConstruct } from '../lib/constructs/bedrock-agent-kb/bedrock-agent-construct';
// import { BedrockKbAgentStack } from '../lib/constructs/bedrock-agent-kb/bedrock-kb-agent-stack';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

const app = new cdk.App();

// Apply CDK nag checks
cdk.Aspects.of(app).add(new AwsSolutionsChecks({verbose: true}));

const s3DataSourceStack = new S3DataSourceStack(app, 's3DataSourceStack', {
  documentDataFolder: appConfig.s3DataSource.documentDataFolder,
  s3Bucketname: appConfig.s3DataSource.s3bucketName,
  env // to overcome cross-environment usage error from creating a stack that is Region/Account-agnostic
});

// Create the Bedrock KB construct
const bedrockKb = new BedrockKbConstruct(new cdk.Stack(app, 'bedrockKbStack', {env}), 'BedrockKb', {
  knowledgebaseDataSourceName: appConfig.knowledgebase.knowledgebaseDataSourceName,
  bedrockKnowledgeS3Bucket: appConfig.s3DataSource.s3bucketName
});

// Create the Bedrock Agent construct
const bedrockAgent = new BedrockAgentConstruct(new cdk.Stack(app, 'bedrockAgentStack', {env}), 'BedrockKb', {
  bedrockKnowledgeId: bedrockKb.kb,
  actionGroups: appConfig.actionGroups
});

// Create the Lex Bot construct
const lexBot = new LexBotConstruct(new cdk.Stack(app, 'LexBotStack'), 'LexBot', {
  bedrockAgentId: bedrockAgent.bedrockAgent.agentId,
  bedrockAgentAliasId: bedrockAgent.agentAlias.aliasId,
});

// Bedrock Agent Blueprint does not support Titan Embedding v2 yet
// const agent2 = new BedrockKbAgentStack(app, "agent2Stack",{
//   bedrockAgentName: "agent2",
//   documentDataFolder: appConfig.s3DataSource.documentDataFolder,
//   bedrockAgentInstruction: 'You are a restaurant reservation agent that has access to restaurant menu knowledge. You can find a local restaurant that match the food preference of the client, make a reservation on behalf of the client with details of date, time, number of people, and the name of the reservation, cancel the reservation by booking ID, or modify the reservation by canceling the booking and recreate a new reservation. You can respond to questions about menu, and the reservation details.',
//   actionGroups: appConfig.actionGroups,
//   knowledgebaseDataSourceName: appConfig.knowledgebase.knowledgebaseDataSourceName,
//   bedrockKnowledgeS3Bucket: appConfig.s3DataSource.s3bucketName
// });

app.synth();
