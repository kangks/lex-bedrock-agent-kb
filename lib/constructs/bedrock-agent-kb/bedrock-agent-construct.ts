import * as cdk from 'aws-cdk-lib';
// import { aws_bedrock as bedrock } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import { NagSuppressions } from "cdk-nag";
import * as path from "path";
import { AgentActionGroup, ContentFilter, KnowledgeBase, Topic } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha';
import * as opensearchserverless from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/opensearchserverless';

export interface ActionGroupConfig {
  lambdaFunctionName: string,
  lambdaFunctionRelativeToConstructPath: string,
  openapiSpecRelativeToConstructPath: string,
  functionEnvironments?: { [key: string]: any }
}

export interface BedrockAgentProps {
  readonly bedrockKnowledgeId: KnowledgeBase;
  readonly actionGroups: ActionGroupConfig[]
}

export class BedrockAgentConstruct extends Construct {
  public readonly bedrockAgent: bedrock.Agent;
  public readonly agentAlias: bedrock.IAgentAlias;

  constructor(scope: Construct, id: string, props: BedrockAgentProps) {
    super(scope, id);

    const inferenceProfile = bedrock.CrossRegionInferenceProfile.fromConfig({
      geoRegion: bedrock.CrossRegionInferenceProfileRegion.US,
      model: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_SONNET_V2_0,
    });

    this.bedrockAgent = new bedrock.Agent(this,
      `${cdk.Stack.of(this).stackName}-agent`,
      {
        name: `${cdk.Stack.of(this).stackName}-agent`,
        foundationModel: inferenceProfile,
        instruction: 'You are a restaurant reservation agent that has access to restaurant menu knowledge. You can find a local restaurant that match the food preference of the client, make a reservation on behalf of the client with details of date, time, number of people, and the name of the reservation, cancel the reservation by booking ID, or modify the reservation by canceling the booking and recreate a new reservation. You can respond to questions about menu, and the reservation details.',
        enableUserInput: true,
        shouldPrepareAgent: true
      }
    );

    this.bedrockAgent.addKnowledgeBase(props.bedrockKnowledgeId);
    this.addActionGroups(props.actionGroups);

    const bedrockGuardrailConfig = require('./bedrock-guardrail.json');

    const guardrail = new bedrock.Guardrail(this, 'guardrail', {
      name: bedrockGuardrailConfig.name,
      description: bedrockGuardrailConfig.description,
      blockedInputMessaging: bedrockGuardrailConfig.blockedInputMessaging,
      blockedOutputsMessaging: bedrockGuardrailConfig.blockedOutputsMessaging,
      contentFilters: bedrockGuardrailConfig.contentPolicyConfig.filtersConfig as ContentFilter[],
      deniedTopics: bedrockGuardrailConfig.topicPolicyConfig.topicsConfig as Topic[],
      wordFilters: bedrockGuardrailConfig.wordPolicy.words
    });
    // guardrail.addWordFilterFromFile(path.join(__dirname, 'word-filter.txt')
    this.bedrockAgent.addGuardrail(guardrail);

    this.agentAlias = this.bedrockAgent.addAlias({
      aliasName: 'agent01',
      description: 'alias for bedrock agent'
    });

    new cdk.CfnOutput(this, 'bedrockAgentId', {
      exportName: `${cdk.Stack.of(this).stackName}-bedrockAgentId`,
      value: this.bedrockAgent.agentId
    });

    new cdk.CfnOutput(this, 'bedrockAgentAliasId', {
      exportName: `${cdk.Stack.of(this).stackName}-bedrockAgentAliasId`,
      value: this.agentAlias.aliasId ?? ""
    });


    NagSuppressions.addResourceSuppressionsByPath(
      cdk.Stack.of(this),
      `/${cdk.Stack.of(this)}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CDK CustomResource LogRetention Lambda uses the AWSLambdaBasicExecutionRole AWS Managed Policy. Managed by CDK.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CDK CustomResource LogRetention Lambda uses a wildcard to manage log streams created at runtime. Managed by CDK.',
        },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressionsByPath(
      cdk.Stack.of(this),
      `/${cdk.Stack.of(this)}/BedrockKb/bedrockStack-agent/Role/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'foundation-model role uses a wildcard and managed by CDK.',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      cdk.Stack.of(this),
      `/${cdk.Stack.of(this)}/OpenSearchIndexCRProvider/CustomResourcesFunction/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'Acceptable risk use the latest runtime for OpenSearch',
        }
      ],
      true
    );
  }

  public static addS3KnowledgeBase(stack: cdk.Stack, knowledgeBaseName: string, bedrockKnowledgeS3Bucket: string): bedrock.KnowledgeBase {
    // Create access logs bucket
    const accesslogBucket = new s3.Bucket(stack, `${stack.stackName}-${knowledgeBaseName}-accesslog`, {
      enforceSSL: true,
      versioned: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    NagSuppressions.addResourceSuppressions(accesslogBucket, [
      { id: 'AwsSolutions-S1', reason: 'There is no need to enable access logging for the AccessLogs bucket.' },
    ]);

    // Create vector store
    const vectorStore = new opensearchserverless.VectorCollection(
      stack,
      `${stack.stackName}-${knowledgeBaseName}-vectorstore`,
      {
        collectionName: knowledgeBaseName,
        standbyReplicas:
          process.env.ENV === 'prd'
            ? opensearchserverless.VectorCollectionStandbyReplicas.ENABLED
            : opensearchserverless.VectorCollectionStandbyReplicas.DISABLED,
      }
    );

    const kb = new bedrock.KnowledgeBase(
      stack,
      `${stack.stackName}-knowledgebase`,
      {
        embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_256,
        instruction: 'Use this knowledge base to answer questions about restaurant menu. ' +
          'It contains the full menu. Please quote the books to explain your answers.',
        vectorStore: vectorStore
      }
    );

    const s3DataSource = new bedrock.S3DataSource(stack,
      `${stack.stackName}-datasource`,
      {
        bucket: cdk.aws_s3.Bucket.fromBucketName(stack, `${stack.stackName}-s3bucket`, bedrockKnowledgeS3Bucket),
        knowledgeBase: kb,
        dataSourceName: `${stack.stackName}-knowledgebase-s3datasource`,
        chunkingStrategy: bedrock.ChunkingStrategy.fixedSize({
          maxTokens: 500,
          overlapPercentage: 20,
        }),
      }
    );

    NagSuppressions.addResourceSuppressions(
      vectorStore,
      [
        {
          id: 'AwsSolutions-L1  ',
          reason: 'Acceptable risk not running latest Lambda runtime for OpenSearch CustomResourcesFunction',
        }
      ],
      true,
    );

    return kb;

  }

  public addActionGroups(actionGroupsParam: ActionGroupConfig[]) {

    const actionGroups: AgentActionGroup[] = []

    actionGroupsParam.forEach((actionGroupConfig: ActionGroupConfig) => {
      let lambdaFunction = new lambda_python.PythonFunction(this,
        `${cdk.Stack.of(this).stackName}-${actionGroupConfig.lambdaFunctionName}`,
        {
          functionName: actionGroupConfig.lambdaFunctionName,
          runtime: lambda.Runtime.PYTHON_3_13,
          entry: path.join(__dirname, actionGroupConfig.lambdaFunctionRelativeToConstructPath),
          layers: [lambda.LayerVersion.fromLayerVersionArn(this, `${actionGroupConfig.lambdaFunctionName}-PowerToolsLayer`,
            `arn:aws:lambda:${cdk.Stack.of(this).region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python313-x86_64:4`)],
          timeout: cdk.Duration.minutes(2),
          environment: {
            POWERTOOLS_LOG_LEVEL: "DEBUG"
          }
        }
      );

      if (actionGroupConfig.functionEnvironments) {
        for (let key in actionGroupConfig.functionEnvironments) {
          lambdaFunction.addEnvironment(
            key, actionGroupConfig.functionEnvironments[key]
          )
        }
      };

      let agentActionGroup = new AgentActionGroup(this,
        `${cdk.Stack.of(this).stackName}-${actionGroupConfig.lambdaFunctionName}-action-group`,
        {
          actionGroupName: `${cdk.Stack.of(this).stackName}-${actionGroupConfig.lambdaFunctionName}-action-group`,
          actionGroupExecutor: {
            lambda: lambdaFunction
          },
          actionGroupState: "ENABLED",
          apiSchema: bedrock.ApiSchema.fromAsset(path.join(__dirname, actionGroupConfig.openapiSpecRelativeToConstructPath)),
          skipResourceInUseCheckOnDelete: true
        }
      );

      actionGroups.push(agentActionGroup);

      NagSuppressions.addResourceSuppressions(
        lambdaFunction,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'ActionGroup Lambda uses the AWSLambdaBasicExecutionRole AWS Managed Policy.',
          }
        ],
        true,
      );
    });
    this.bedrockAgent.addActionGroups(actionGroups);
  }

  // public addBedrockGuardrail(bedrockAgent: bedrock.Agent) {
  //   bedrockAgent.addGuardrail(
  //     new bedrock.Guardrail(this, `${cdk.Stack.of(this).stackName}-guardrail`, {
  //       name: `${cdk.Stack.of(this).stackName}-guardrail`,
  //       blockList: [
  //         'Do not mention the name of the restaurant or the menu.',
  //         'Do not mention the name of the restaurant or the menu.',
  //         'Do not mention the name of the restaurant or the menu.',
  //       ]
  //     }
  //     ))
  // }
}