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
│   ├── constructs/      # CDK construct implementations
│   │   ├── bedrock-agent-kb/    # Bedrock Knowledge Base construct
│   │   │   ├── action-group.yaml # OpenAPI spec for Action Group API
│   │   │   ├── bedrock-kb-construct.ts # Bedrock KB construct implementation
│   │   │   └── lambda/          # Lambda functions for Bedrock KB
│   │   └── lex-bot/            # Lex Bot construct
│   │       ├── lex-bot-construct.ts # Lex Bot construct implementation
│   │       └── lambda/          # Lambda functions for Lex Bot
│   └── s3-datasource-stack.ts   # Main stack for S3 data source
├── scripts/            # Utility scripts
└── test/              # Test files
```

## Components

### CDK Infrastructure
The infrastructure is organized into reusable constructs and a main stack:

#### CDK Constructs

1. **BedrockKbConstruct** (`lib/constructs/bedrock-agent-kb/bedrock-kb-construct.ts`)
   - A reusable construct for Amazon Bedrock Knowledge Base integration
   - Creates and manages S3 buckets for knowledge base data storage
   - Supports configurable knowledge base data source names
   - Handles S3 bucket configurations with proper security settings
   - Properties:
     - `knowledgebaseDataSourceName`: Name of the knowledge base data source
     - `bedrockKnowledgeS3Datasource`: S3 bucket for storing knowledge base data

2. **LexBotConstruct** (`lib/constructs/lex-bot/lex-bot-construct.ts`)
   - A reusable construct for Amazon Lex bot configuration
   - Integrates with Bedrock agent through provided agent IDs
   - Manages Lex bot configurations and permissions
   - Properties:
     - `bedrockAgentId`: ID of the Bedrock agent to integrate with
     - `bedrockAgentAliasId`: Alias ID of the Bedrock agent

#### Main Stack

- **S3DataSourceStack** (`lib/s3-datasource-stack.ts`)
  - Main CDK stack that combines the constructs
  - Orchestrates the integration between Bedrock KB and Lex Bot
  - Manages the overall infrastructure deployment

The constructs are designed to be modular and reusable, allowing for flexible deployment configurations while maintaining clean separation of concerns.

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
1. Deploy the CDK stacks
2. Configure the Lex bot with appropriate intents
3. Set up the Bedrock Agent with the provided Knowledge Base
4. Test the integration using the Lex console or API

## Security

The infrastructure includes security best practices such as:
- S3 bucket encryption
- SSL enforcement
- Public access blocking
- Version control for audit trails

