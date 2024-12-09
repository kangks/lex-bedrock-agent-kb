import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lex from 'aws-cdk-lib/aws-lex';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha';
import { NagSuppressions } from "cdk-nag";
import * as path from "path";

export interface LexBotStackProps extends cdk.StackProps {
  readonly bedrockAgentId: string;
  readonly bedrockAgentAliasId: string;
}

export class LexBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LexBotStackProps) {
    super(scope, id, props);

    const lexIntentName = "lexBedrockKB";

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
              resources: ['*']
            }),
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
    });

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
                `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:agent-alias/${props.bedrockAgentId}/*` 
              ]
            })
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
        BEDROCK_AGENT_ID: props.bedrockAgentId,
        BEDROCK_AGENT_ALIAS_ID: props.bedrockAgentAliasId
      }
    });

    lexFallbackFunction.grantInvoke(new cdk.aws_iam.ServicePrincipal('lexv2.amazonaws.com'))
    NagSuppressions.addResourceSuppressions(lexFallbackFunctionLambdaRole, [{
      id: 'AwsSolutions-IAM5',
      reason: 'Wildcard permission is needed to create custom Lambda execution role to write to CloudWatch Logs'
    }],
      true
    );

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
        voiceSettings: {
          voiceId: 'Joanna'
        },
        intents: [{
          name: lexIntentName,
          description: 'Intent to handle general questions about books',
          sampleUtterances: [
            {
              utterance: 'Tell me about a book'
            },
            {
              utterance: 'What books do you know about?'
            }
          ],
          fulfillmentCodeHook: {
            enabled: true
          }
        }]
      }]
    });

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

  }
}