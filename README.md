# Lex Bedrock Agent Integration Demo

This repository demonstrates the integration of Amazon Lex with Amazon Bedrock Agent, showcasing how to handle both external API calls and Bedrock Knowledge Base queries through a fallback intent handler.

## Overview

This project implements a chatbot using Amazon Lex that leverages Amazon Bedrock Agent to handle queries. When Lex cannot handle a user query directly, it falls back to a Bedrock Agent that can:
- Access external APIs through Action Groups
- Query the Bedrock Knowledge Base
- Provide intelligent responses using the combined capabilities

## Repository Structure

```
.
├── bin/                  # CDK app entry point
├── lib/                  # CDK infrastructure code
│   ├── action-group.yaml # OpenAPI spec for Action Group API
│   └── lex-bedrock-agent-kb-stack.ts # Main CDK stack
├── lambda/              # Lambda function implementations
│   ├── action-group/    # Action Group handler for external API calls
│   └── lex-fallback/   # Fallback intent handler for Bedrock Agent
└── scripts/            # Utility scripts
```

## Components

### CDK Infrastructure
The infrastructure is defined in `lib/lex-bedrock-agent-kb-stack.ts` and includes:
- S3 buckets for access logs and storage
- IAM roles and permissions
- Lambda functions configuration
- Lex bot configuration
- Bedrock Agent setup

### Lambda Functions

1. **Lex Fallback Handler** (`lambda/lex-fallback/`)
   - Handles queries that Lex cannot process directly
   - Integrates with Bedrock Agent Runtime
   - Formats responses for Lex compatibility

2. **Action Group Handler** (`lambda/action-group/`)
   - Implements external API integrations
   - Provides book information through Gutendex API
   - Handles top books retrieval functionality

### Action Groups
Defined in `action-group.yaml`, this OpenAPI specification describes the available external API endpoints that Bedrock Agent can invoke, including:
- GET /top_books: Retrieves metadata about the most popular books

## Getting Started

1. Download the sample books by running `bash scripts/load-kb.sh`
1. Deploy the CDK stack
2. Configure the Lex bot with appropriate intents
3. Set up the Bedrock Agent with the provided Knowledge Base
4. Test the integration using the Lex console or API

## Security

The infrastructure includes security best practices such as:
- S3 bucket encryption
- SSL enforcement
- Public access blocking
- Version control for audit trails
