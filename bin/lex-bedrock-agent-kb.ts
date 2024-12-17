#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {AwsSolutionsChecks} from "cdk-nag";
import { S3DataSourceStack } from '../lib/s3-datasource-stack';
import { BedrockKbConstruct } from '../lib/constructs/bedrock-agent-kb/bedrock-kb-construct';
import { LexBotConstruct } from '../lib/constructs/lex-bot/lex-bot-construct';
import appConfig from '../app-config.json';

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
const bedrockKb = new BedrockKbConstruct(new cdk.Stack(app, 'bedrockStack'), 'BedrockKb', {
  knowledgebaseDataSourceName: appConfig.knowledgebase.knowledgebaseDataSourceName,
  bedrockKnowledgeS3Bucket: appConfig.s3DataSource.s3bucketName,
  actionGroups: appConfig.actionGroups
});

// Create the Lex Bot construct
const lexBot = new LexBotConstruct(new cdk.Stack(app, 'LexBotStack'), 'LexBot', {
  bedrockAgentId: bedrockKb.bedrockAgent.agentId,
  bedrockAgentAliasId: bedrockKb.agentAlias.aliasId,
});

// const kb = bedrockKb.addS3KnowledgeBase(props.knowledgebaseDataSourceName, props.bedrockKnowledgeS3Datasource);
// bedrockKb.bedrockAgent.addKnowledgeBase(kb);
// this.addActionGroup();

app.synth();

// {
//   "lambdaFunctionName": "restaurant-finder",
//   "lambdaFunctionRelativeToConstructPath":"../../../restaurant_planner/restaurant-finder-openapi",
//   "openapiSpecRelativeToConstructPath":"../../../restaurant_planner/restaurant-finder-openapi/restaurant-finder.json",
//   "functionEnvironments":{
//       "SERPAPI_SERPAPI_API_KEY": "xyz"
//   }
// }
