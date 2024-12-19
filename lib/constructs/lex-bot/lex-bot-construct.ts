import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lex from 'aws-cdk-lib/aws-lex';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha';
import { NagSuppressions } from "cdk-nag";
import * as path from "path";

export interface LexBotProps {
  readonly bedrockAgentId: string;
  readonly bedrockAgentAliasId: string;
}

export class LexBotConstruct extends Construct {

  public readonly lexBot: lex.CfnBot;

  constructor(scope: Construct, id: string, props: LexBotProps) {
    super(scope, id);

    const lexIntentName = "lexBedrockKB";

    const lexRole = new cdk.aws_iam.Role(this,
      `${cdk.Stack.of(this).stackName}-LexRole`,
      {
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
                  `arn:aws:lex:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:intent:${lexIntentName}:*`,
                ]
              }),
            ]
          })
        }
      });

    const lexFallbackFunctionLambdaRole = new cdk.aws_iam.Role(this,
      `${cdk.Stack.of(this).stackName}-lexfallback-lambdarole`,
      {
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
                  `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/lambda/*`
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

    const lexFallbackFunction = new lambda_python.PythonFunction(this,
      `${cdk.Stack.of(this).stackName}-lexfallback-lambdafunction`,
      {
        runtime: lambda.Runtime.PYTHON_3_13,
        handler: 'lambda_handler',
        entry: path.join(__dirname, './lambda/lex-fallback'),
        layers: [lambda.LayerVersion.fromLayerVersionArn(this, 'LexFallbackPowerToolsLayer',
          `arn:aws:lambda:${cdk.Stack.of(this).region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python313-x86_64:4`)],
        timeout: cdk.Duration.minutes(2),
        role: lexFallbackFunctionLambdaRole,
        environment: {
          BEDROCK_AGENT_ID: props.bedrockAgentId,
          BEDROCK_AGENT_ALIAS_ID: props.bedrockAgentAliasId,
          POWERTOOLS_LOG_LEVEL: "DEBUG",
          ENABLE_BEDROCK_AGENT_TRACE: "True"
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
      description: 'Lex Bedrock Test Bot Alias',
      sentimentAnalysisSettings: {
        DetectSentiment: false,
      },
    };

    // Create Lex bot with fallback intent
    this.lexBot = new lex.CfnBot(this,
      `${cdk.Stack.of(this).stackName}-lexbot`,
      {
        name: lexIntentName,
        roleArn: lexRole.roleArn,
        dataPrivacy: {
          ChildDirected: true
        },
        idleSessionTtlInSeconds: 300,
        botLocales: [{
          localeId: 'en_US',
          nluConfidenceThreshold: 0.40,
          voiceSettings: {
            voiceId: 'Joanna'
          },
          intents: [
            {
              name: 'WelcomeIntent',
              sampleUtterances: [
                { 'utterance': 'Hello' }
              ],
              slots:[
                {
                  name: "firstname",
                  slotTypeName: "AMAZON.FirstName",
                  valueElicitationSetting: {
                    slotConstraint: "Required",
                    promptSpecification: {
                      messageGroupsList: [
                          {
                              message: {
                                plainTextMessage: {
                                  value: "Hello, what's your name?"
                                }
                              }
                          },
                      ],
                      "maxRetries": 5,
                      "allowInterrupt": true,
                    },
                  }
                }
              ],
              slotPriorities: [
                { priority: 1, slotName: 'firstname' },
              ],
              intentClosingSetting: {
                closingResponse: {
                  messageGroupsList: [{
                    message: {
                      plainTextMessage: { value: 'Hello {firstname}, how can I help you?' },
                    },
                  }],
                }
              }
            },
            {
              name: 'FallbackIntent', // Explicitly reference fallback intent
              description: 'Default fallback intent',
              parentIntentSignature: 'AMAZON.FallbackIntent',
              fulfillmentCodeHook: { enabled: true },
            }
          ],
          description: 'Lex Bedrock Test Bot'
        }],
        autoBuildBotLocales: true,
        testBotAliasSettings: testBotAliasSettingsProperty
      });

    // Publish a numeric version of the bot
    const botVersion = new lex.CfnBotVersion(this,
      `${cdk.Stack.of(this).stackName}-lexbotversion`,
      {
        botId: this.lexBot.attrId, // Reference the bot ID
        botVersionLocaleSpecification: [
          {
            localeId: 'en_US', // Specify the locale
            botVersionLocaleDetails: {
              sourceBotVersion: 'DRAFT', // Publish from the DRAFT version
            },
          },
        ],
      });

    // Associate Lambda with Lex Bot
    const botAlias = new lex.CfnBotAlias(this,
      `${cdk.Stack.of(this).stackName}-lexbotalias`,
      {
        botId: this.lexBot.attrId,
        botAliasName: 'TestChatBotAlias',
        botVersion: botVersion.attrBotVersion,
        botAliasLocaleSettings: [
          {
            localeId: 'en_US', // Specify the locale
            botAliasLocaleSetting: {
              enabled: true, // Enable the locale
              codeHookSpecification: {
                lambdaCodeHook: {
                  codeHookInterfaceVersion: '1.0', // Lambda interface version
                  lambdaArn: lexFallbackFunction.functionArn, // ARN of the Lambda function
                },
              },
            },
          },
        ],
      });

    // Lex bot alias output
    new cdk.CfnOutput(this, 'LexBotAlias', {
      value: botAlias.attrBotAliasId,
      description: 'Alias ID for Lex bot',
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