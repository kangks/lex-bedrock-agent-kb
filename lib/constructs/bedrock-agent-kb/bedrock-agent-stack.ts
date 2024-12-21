import * as cdk from 'aws-cdk-lib';
import { resolve } from "path";
import { Construct } from 'constructs';
import { BedrockAgentBlueprintsConstruct, AgentDefinitionBuilder, AgentActionGroup, AgentKnowledgeBase, BedrockKnowledgeBaseModels, KnowledgeBaseStorageConfigurationTypes, CollectionType } from '@aws/agents-for-amazon-bedrock-blueprints';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { BedrockGuardrailsBuilder, FilterType, ManagedWordsTypes, PIIAction, PIIType } from '@aws/agents-for-amazon-bedrock-blueprints';
import * as path from "path";
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha';
import * as fs from 'fs';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import * as BedrockConstruct from './bedrock-kb-construct';
import { CfnKnowledgeBase } from 'aws-cdk-lib/aws-bedrock';

export interface ActionGroupConfigParam {
    lambdaFunctionName: string,
    lambdaFunctionRelativeToConstructPath: string,
    openapiSpecRelativeToConstructPath: string,
    functionEnvironments?: { [key: string]: any }
}

export interface BedrockKbProps extends cdk.StackProps {
    readonly bedrockAgentName: string;
    // readonly knowledgebaseDataSourceName: string;
    readonly documentDataFolder: string;
    readonly bedrockAgentInstruction: string;
    readonly knowledgebaseDataSourceName: string
    readonly bedrockKnowledgeS3Bucket: string;  
    readonly actionGroups: ActionGroupConfigParam[]
}

export class BedrockAgentStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BedrockKbProps) {
        super(scope, id, props);

        const inferenceProfile = bedrock.CrossRegionInferenceProfile.fromConfig({
            geoRegion: bedrock.CrossRegionInferenceProfileRegion.US,
            model: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_SONNET_V2_0,
        });

        const agentDef = new AgentDefinitionBuilder(this,
            `${this.stackName}-agent-definition`,
            {}
        )
            .withAgentName(props.bedrockAgentName)
            .withInstruction(props.bedrockAgentInstruction)
            .withFoundationModel(inferenceProfile.inferenceProfileModel.modelArn)
            .withUserInput()
            .build();

        const actions = this.buildAgentActionGroup(props.actionGroups);

        // const kb = this.buildKBWithBlueprint(props.documentDataFolder);

        const blueprint = new BedrockAgentBlueprintsConstruct(this, 'AmazonBedrockAgentBlueprintsStack', {
            agentDefinition: agentDef,
            actionGroups: actions
        });

        // const kb = this.buildKbWithGenAiConstruct(props.knowledgebaseDataSourceName, props.bedrockKnowledgeS3Bucket)
        // blueprint.agent.knowledgeBases = [kb];
    }

    private buildAgentActionGroup(actionGroupsParam: ActionGroupConfigParam[]): AgentActionGroup[] {

        const actionGroups: AgentActionGroup[] = []

        actionGroupsParam.forEach((actionGroupConfig: ActionGroupConfigParam) => {
            let lambdaFunction = new lambda_python.PythonFunction(this,
                `${cdk.Stack.of(this).stackName}-${actionGroupConfig.lambdaFunctionName}`,
                {
                    functionName: `${cdk.Stack.of(this).stackName}-${actionGroupConfig.lambdaFunctionName}`,
                    runtime: cdk.aws_lambda.Runtime.PYTHON_3_13,
                    entry: path.join(__dirname, actionGroupConfig.lambdaFunctionRelativeToConstructPath),
                    layers: [cdk.aws_lambda.LayerVersion.fromLayerVersionArn(this, `${actionGroupConfig.lambdaFunctionName}-PowerToolsLayer`,
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
                        lambdaExecutor: lambdaFunction
                    },
                    schemaDefinition: {
                        apiSchemaFile: fs.readFileSync(resolve(__dirname, actionGroupConfig.openapiSpecRelativeToConstructPath))
                    }
                }
            );

            actionGroups.push(agentActionGroup);
        });

        return actionGroups;
    }

    private buildKbWithGenAiConstruct(
        knowledgeBaseName: string, bedrockKnowledgeS3Bucket: string):cdk.aws_bedrock.CfnAgent.AgentKnowledgeBaseProperty{
        const kb: bedrock.KnowledgeBase = BedrockConstruct.BedrockKbConstruct.addS3KnowledgeBase(this,knowledgeBaseName, bedrockKnowledgeS3Bucket);
        
        return <cdk.aws_bedrock.CfnAgent.AgentKnowledgeBaseProperty>{
            description: "Amazon Bedrock Knowledge Base",
            knowledgeBaseId: kb.knowledgeBaseId
        };
    }

    private buildKBWithBlueprint(documentDataFolder: string): AgentKnowledgeBase {
        // https://aws.amazon.com/blogs/aws/amazon-titan-text-v2-now-available-in-amazon-bedrock-optimized-for-improving-rag/
        // Larger vector sizes create more detailed responses, but will also increase the computational time. Shorter vector lengths are less detailed but will improve the response time. 
        const vector_size = 1024;

        const kbAccessRole = new cdk.aws_iam.Role(this, 'TestAccessRole', {
            assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
        });

        // Requires fix: https://github.com/awslabs/agents-for-amazon-bedrock-blueprints/issues/27
        const kb = new AgentKnowledgeBase(this, 'TestKB', {
            embeddingModel: new BedrockKnowledgeBaseModels("amazon.titan-embed-text-v2:0", vector_size),
            kbName: 'RestaurantMenuKB',
            agentInstruction: 'Use this knowledge base to answer questions about restaurant menu. It contains the full menu. Please quote the books to explain your answers.',
            assetFiles: fs.readdirSync(documentDataFolder)
                .map(f =>
                    fs.readFileSync(
                        resolve(
                            documentDataFolder, f)
                    )),
            storageConfiguration: {
                type: KnowledgeBaseStorageConfigurationTypes.OPENSEARCH_SERVERLESS,
                configuration: {
                    collectionName: 'restaurant-menu-kb',
                    indexName: 'restaurant-menu-kb-vector-index',
                    collectionType: CollectionType.VECTORSEARCH,
                    region: process.env.CDK_DEFAULT_REGION || '',
                    accountId: process.env.CDK_DEFAULT_ACCOUNT || '',
                    accessRoles: [kbAccessRole],
                }
            },
        });

        return kb;
    }
}