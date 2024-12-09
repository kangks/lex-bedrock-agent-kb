import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lex from 'aws-cdk-lib/aws-lex';

import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import {NagSuppressions} from "cdk-nag";
import * as path from "path";
import { AgentActionGroup } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock';
import * as opensearchserverless from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/opensearchserverless';

export interface LexBedrockAgentKbStackPropsSubnetType extends cdk.StackProps {
  readonly bedrockKnowledgeS3Datasource?:s3.IBucket, 
}

export class LexBedrockAgentKbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LexBedrockAgentKbStackPropsSubnetType) {
    super(scope, id, props);

    const accesslogBucket = new s3.Bucket(this, 'AccessLogs', {
      enforceSSL: true,
      versioned: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    NagSuppressions.addResourceSuppressions(accesslogBucket, [
      {id: 'AwsSolutions-S1', reason: 'There is no need to enable access logging for the AccessLogs bucket.'},
    ])


    const docBucket = props.bedrockKnowledgeS3Datasource ?? new s3.Bucket(this, 'DocBucket', {
      enforceSSL: true,
      versioned: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      serverAccessLogsBucket: accesslogBucket,
      serverAccessLogsPrefix: 'inputsAssetsBucketLogs/',
    });

    const vectorStore = new opensearchserverless.VectorCollection(
      this,
      'VectorCollectionName',
      {
        collectionName: 'collection-name',
        standbyReplicas:
          process.env.ENV === 'prd'
            ? opensearchserverless.VectorCollectionStandbyReplicas.ENABLED
            : opensearchserverless.VectorCollectionStandbyReplicas.DISABLED,
      }
    );    

    const kb = new bedrock.KnowledgeBase(
      this, 
      'BedrockKnowledgeBase', 
      {
        embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_256,
        instruction: 'Use this knowledge base to answer questions about books. ' +
          'It contains the full text of novels. Please quote the books to explain your answers.',
          vectorStore
      }
    );

    const s3DataSource = new bedrock.S3DataSource(this, "DataSource", {
      bucket: docBucket,
      knowledgeBase: kb,
      dataSourceName: "books",
      chunkingStrategy: bedrock.ChunkingStrategy.fixedSize({
        maxTokens: 500,
        overlapPercentage: 20,
      }),
    });

    const agent = new bedrock.Agent(this, 'BedrockAgent', {
      foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_V2_1,
      instruction: 'You are a helpful and friendly agent that answers questions about literature.',
      knowledgeBases: [kb],
      enableUserInput: true,
      shouldPrepareAgent:true
    });

    const actionGroupFunction = new lambda_python.PythonFunction(this, 'BedrockActionGroupFunction', {
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: path.join(__dirname, '../lambda/action-group'),
      layers: [lambda.LayerVersion.fromLayerVersionArn(this, 'PowerToolsLayer', `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python313-x86_64:4`)],
      timeout: cdk.Duration.minutes(2)
    });

    const actionGroup = new AgentActionGroup(this,'MyActionGroup',{
      actionGroupName: 'query-library',
      description: 'Use these functions to get information about the books in the library.',
      actionGroupExecutor: {
        lambda: actionGroupFunction
      },
      actionGroupState: "ENABLED",
      apiSchema: bedrock.ApiSchema.fromAsset(path.join(__dirname, 'action-group.yaml')),
    });

    agent.addActionGroups([actionGroup])

    const agentAlias = agent.addAlias({
      aliasName: 'agent01', //Member must have length less than or equal to 10
      description:'alias for my agent'
      
    })
  
    const lexIntentName = "lexBedrockKB"

    const lexRole = new cdk.aws_iam.Role(this, 'LexRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lex.amazonaws.com'),
      inlinePolicies: {
        'LexBasicExecution': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'polly:SynthesizeSpeech',
              ],
              resources: [
                `*`,
              ]
            }),
            // Put intent
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'lex:PutIntent',
              ],
              resources: [
                `arn:aws:lex:${props?.env?.region}:${props?.env?.account}:intent:${lexIntentName}:*`,
              ]
            }),
          ]
        })
      }
    })

    const lexFallbackFunctionLambdaRole = new cdk.aws_iam.Role(this, 'lambdaRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        'LambdaBasicExecution': new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents'
              ],
              resources: [
                `arn:aws:logs:${props?.env?.region}:${props?.env?.account}:log-group:/aws/lambda/${this.stackName}*`
              ]
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeAgent',
              ],
              resources: [
                `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:agent-alias/${agent.agentId}/${agentAlias.aliasId}` 
              ]
            }),
            // new cdk.aws_iam.PolicyStatement({
            //   effect: cdk.aws_iam.Effect.ALLOW,
            //   actions: [
            //     'bedrock:InvokeModel',
            //   ],
            //   resources: [
            //     `arn:aws:bedrock:${props?.env?.region}::foundation-model/${bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_HAIKU_V1_0}`,
            //   ]
            // }),
            // new cdk.aws_iam.PolicyStatement({
            //   effect: cdk.aws_iam.Effect.ALLOW,
            //   actions: [
            //     'bedrock:Retrieve',
            //   ],
            //   resources: [
            //     `arn:aws:bedrock:${props?.env?.region}:${props?.env?.account}:knowledge-base/${knowledge_base_id}`,
            //   ]
            // }),
          ]
        })
      }
    });
    
    const lexFallbackFunction = new lambda_python.PythonFunction(this, 'LexFallbackFunction', {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'lambda_handler',
      entry: path.join(__dirname, '../lambda/lex-fallback'),
      layers: [lambda.LayerVersion.fromLayerVersionArn(this, 'LexFallbackPowerToolsLayer', `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python313-x86_64:4`)],
      timeout: cdk.Duration.minutes(2),
      role: lexFallbackFunctionLambdaRole,
      environment: {
        BEDROCK_AGENT_ID: agent.agentId,
        BEDROCK_AGENT_ALIAS_ID: agentAlias.aliasId
      }
    });

    lexFallbackFunction.grantInvoke(new cdk.aws_iam.ServicePrincipal('lexv2.amazonaws.com'))
    NagSuppressions.addResourceSuppressions(lexFallbackFunctionLambdaRole, [{
      id: 'AwsSolutions-IAM5',
      reason: 'Wildcard permission is needed to create custom Lambda execution role to write to CloudWatch Logs'
    }],
      true
    );
    // lexFallbackFunction.addPermission("Lex Invocation", {
    //   principal: new cdk.aws_iam.ServicePrincipal("lexv2.amazonaws.com"),
    //   sourceArn: `arn:aws:lex:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:bot-alias/${lexBot.attrId}/*`,
    // })    


    const testBotAliasSettingsProperty: lex.CfnBot.TestBotAliasSettingsProperty = {
      botAliasLocaleSettings: [{
        botAliasLocaleSetting: {
          enabled: true,
          codeHookSpecification: {
            lambdaCodeHook: {
              codeHookInterfaceVersion: '1.0',
              lambdaArn: lexFallbackFunction.functionArn,
            },
          },
        },
        localeId: 'en_US',
      }],
      description: 'Langchain Bedrock Test Bot Alias',
      sentimentAnalysisSettings: {
        DetectSentiment: false,
      },
    };    

    // Create Lex bot with fallback intent
    const lexBot = new lex.CfnBot(this, 'BookBot', {
      dataPrivacy: {
        ChildDirected: true
      },
      idleSessionTtlInSeconds: 300,
      name: lexIntentName,
      roleArn: lexRole.roleArn,
      autoBuildBotLocales: true,
      testBotAliasSettings: testBotAliasSettingsProperty,
      botLocales: [{
        localeId: 'en_US',
        nluConfidenceThreshold: 0.40,
        intents: [
          {
            name: 'WelcomeIntent',
            description: 'Greeting prompt',
            sampleUtterances: [
              {utterance: 'Hi'},
              {utterance: 'Hello'},
              {utterance: 'Hey'}, 
            ],
            intentClosingSetting:{
              closingResponse: {
                messageGroupsList: [
                  {
                    message: {
                      plainTextMessage: {
                        value: 'Hi there, I am Bedrock-backed Lex bot. How can I help you?'
                      }
                    }
                  }
                ]
              },
              nextStep: {
                'dialogAction': {
                  type: 'ElicitIntent',
                }
              }              
            }
          },
          {
            name: 'FallbackIntent',
            description: 'Default intent when no other intent matches',
            parentIntentSignature: 'AMAZON.FallbackIntent',
            fulfillmentCodeHook: {
              enabled: true
            }
          }
        ]
      }]
    });

    new cdk.CfnOutput(this, 'AgentId', {value: agent.agentId});
    new cdk.CfnOutput(this, 'KnowledgeBaseId', {value: kb.knowledgeBaseId});
    new cdk.CfnOutput(this, 'DocumentBucket', {value: docBucket.bucketName});
    new cdk.CfnOutput(this, 'StartIngestionJob', {value: `aws bedrock-agent start-ingestion-job --knowledge-base-id ${kb.knowledgeBaseId} --data-source-id ${s3DataSource.dataSourceId}`});

    NagSuppressions.addResourceSuppressions(
      actionGroupFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'ActionGroup Lambda uses the AWSLambdaBasicExecutionRole AWS Managed Policy.',
        }
      ],
      true,
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${this.node.path}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole`,
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

    NagSuppressions.addResourceSuppressions(
      lexRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permission is needed to create custom Lex execution role to use Polly Voices',
        },
      ],
      true,
    );    

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${this.node.path}/OpenSearchIndexCRProvider/CustomResourcesFunction/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'Cannnot figure how to fix this',
        }
      ],
      true,
    );    
  }
}
