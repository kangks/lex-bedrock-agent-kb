import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import { NagSuppressions } from "cdk-nag";
import * as path from "path";
import { AgentActionGroup } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha';
import * as opensearchserverless from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/opensearchserverless';

export interface BedrockKbProps {
  readonly knowledgebaseDataSourceName: string
  readonly bedrockKnowledgeS3Datasource: s3.IBucket;
}

export class BedrockKbConstruct extends Construct {
  // public readonly docBucket: s3.IBucket;
  public readonly bedrockAgent: bedrock.Agent;
  public readonly agentAlias: bedrock.IAgentAlias;

  constructor(scope: Construct, id: string, props: BedrockKbProps) {
    super(scope, id);

    this.bedrockAgent = new bedrock.Agent(this, 
      `${cdk.Stack.of(this).stackName}-agent`, 
      {
        name: `${cdk.Stack.of(this).stackName}-agent`,
        foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_V2_1,
        instruction: 'You are a helpful and friendly agent that answers questions about literature.',
        // knowledgeBases: [kb],
        enableUserInput: true,
        shouldPrepareAgent: true
      }
    );

    this.agentAlias = this.bedrockAgent.addAlias({
      aliasName: 'agent01',
      description:'alias for bedrock agent'
    });

    this.addS3KnowledgeBase(props.knowledgebaseDataSourceName, props.bedrockKnowledgeS3Datasource);
    this.addActionGroup();

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

  public addS3KnowledgeBase(knowledgeBaseName: string, bedrockKnowledgeS3Datasource: s3.IBucket ){
    // Create access logs bucket
    const accesslogBucket = new s3.Bucket(this, `${cdk.Stack.of(this).stackName}-${knowledgeBaseName}-accesslog`, {
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
    ]);

    // Create vector store
    const vectorStore = new opensearchserverless.VectorCollection(
      this,
      `${cdk.Stack.of(this).stackName}-vectorstore`,
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
      `${cdk.Stack.of(this).stackName}-knowledgebase`,
      {
        embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_256,
        instruction: 'Use this knowledge base to answer questions about books. ' +
          'It contains the full text of novels. Please quote the books to explain your answers.',
        vectorStore: vectorStore
      }
    );

    const s3DataSource = new bedrock.S3DataSource(this, 
      `${cdk.Stack.of(this).stackName}-datasource`, 
      {
        bucket: bedrockKnowledgeS3Datasource,
        knowledgeBase: kb,
        dataSourceName: `${cdk.Stack.of(this).stackName}-knowledgebase-s3datasource`,
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
        
  }

  private addActionGroup(){
    const actionGroupFunction = new lambda_python.PythonFunction(this, 
      `${cdk.Stack.of(this).stackName}-functions`, 
      {
        functionName: `${cdk.Stack.of(this).stackName}-functions`,
        runtime: lambda.Runtime.PYTHON_3_13,
        entry: path.join(__dirname, './lambda/gutendex-action-group'),
        layers: [lambda.LayerVersion.fromLayerVersionArn(this, 'PowerToolsLayer', 
          `arn:aws:lambda:${cdk.Stack.of(this).region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python313-x86_64:4`)],
        timeout: cdk.Duration.minutes(2)
      }
    );

    const actionGroup = new AgentActionGroup(this, 
      `${cdk.Stack.of(this).stackName}-action-group`,
      {
        actionGroupName: `${cdk.Stack.of(this).stackName}-action-group`,
        description: 'Use these functions to get information about the books in the library.',
        actionGroupExecutor: {
          lambda: actionGroupFunction
        },
        actionGroupState: "ENABLED",
        apiSchema: bedrock.ApiSchema.fromAsset(path.join(__dirname, './action-group.yaml')),
      }
    );

    this.bedrockAgent.addActionGroups([actionGroup]);

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
  }
}