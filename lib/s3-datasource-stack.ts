import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from "cdk-nag";

export interface S3DataSourceStackProps extends cdk.StackProps {
    readonly s3Bucketname?: string;
}
  
export class S3DataSourceStack extends cdk.Stack {

  public readonly s3Bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3DataSourceStackProps) {
      super(scope, id, props);

      this.s3Bucket = new cdk.aws_s3.Bucket(this, 's3DataSourceBucket', {
          bucketName: props.s3Bucketname ?? `s3-data-source-${cdk.Stack.of(this).account}`,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          autoDeleteObjects: true,
          enforceSSL: true
        });

      new cdk.aws_s3_deployment.BucketDeployment(this, 's3DeployFiles', {
        sources: [cdk.aws_s3_deployment.Source.asset('./sample_data')],
        destinationBucket: this.s3Bucket,
      });

      NagSuppressions.addStackSuppressions(
        this,
        [
          {
            id: 'AwsSolutions-S1',
            reason: 'There is no need to enable access logging for the data source bucket.',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Acceptable risk with The IAM entity contains wildcard permissions',
          },
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Acceptable risk with The IAM entity contains wildcard permissions',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'Acceptable risk with The Lambda function is unencrypted',
          }
        ],
        true,
      );      
  }
}
