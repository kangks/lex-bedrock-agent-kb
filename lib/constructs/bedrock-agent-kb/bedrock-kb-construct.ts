import * as cdk from 'aws-cdk-lib';
// import { aws_bedrock as bedrock } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import { NagSuppressions } from "cdk-nag";
import * as opensearchserverless from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/opensearchserverless';
s
export interface BedrockKbProps {
  readonly knowledgebaseDataSourceName: string
  readonly bedrockKnowledgeS3Bucket: string;
}

export class BedrockKbConstruct extends Construct {
  public readonly kb: bedrock.KnowledgeBase;

  constructor(scope: Construct, id: string, props: BedrockKbProps) {
    super(scope, id);

    this.kb = BedrockKbConstruct.addS3KnowledgeBase(cdk.Stack.of(this),
      props.knowledgebaseDataSourceName,
      props.bedrockKnowledgeS3Bucket
    );

    new cdk.CfnOutput(this, 'bedrockKbId', {
      exportName: `${cdk.Stack.of(this).stackName}-knowledgeBaseId`,
      value: this.kb.knowledgeBaseId,
    });
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
}