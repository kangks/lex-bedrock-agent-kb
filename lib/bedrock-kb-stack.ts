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

export interface BedrockKbStackProps extends cdk.StackProps {
  readonly bedrockKnowledgeS3Datasource?: s3.IBucket;
}

export class BedrockKbStack extends cdk.Stack {
  public readonly docBucket: s3.IBucket;
  public readonly vectorStore: opensearchserverless.VectorCollection;
  public readonly bedrockAgent: bedrock.Agent;

  constructor(scope: Construct, id: string, props: BedrockKbStackProps) {
    super(scope, id, props);

    // Create access logs bucket
    const accesslogBucket = new s3.Bucket(this, `${this.stackName}-s3accesslog`, {
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

    // Create or use existing document bucket
    this.docBucket = props.bedrockKnowledgeS3Datasource ?? new s3.Bucket(this, `${this.stackName}-s3datasource`, {
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

    // Create vector store
    this.vectorStore = new opensearchserverless.VectorCollection(
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
        vectorStore: this.vectorStore
      }
    );

    const s3DataSource = new bedrock.S3DataSource(this, "DataSource", {
      bucket: this.docBucket,
      knowledgeBase: kb,
      dataSourceName: "books",
      chunkingStrategy: bedrock.ChunkingStrategy.fixedSize({
        maxTokens: 500,
        overlapPercentage: 20,
      }),
    });

    this.bedrockAgent = new bedrock.Agent(this, 'BedrockAgent', {
      foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_V2_1,
      instruction: 'You are a helpful and friendly agent that answers questions about literature.',
      knowledgeBases: [kb],
      enableUserInput: true,
      shouldPrepareAgent: true
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

    this.bedrockAgent.addActionGroups([actionGroup]);

    const agentAlias = this.bedrockAgent.addAlias({
      aliasName: 'agent01',
      description:'alias for my agent'
    });

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
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${this.node.path}/OpenSearchIndexCRProvider/CustomResourcesFunction/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'Acceptable risk use the latest runtime for OpenSearch',
        }
      ],
      true,
    );        
  }
}