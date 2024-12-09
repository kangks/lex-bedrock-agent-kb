# CDK Stack Refactoring Update

The CDK stack has been refactored to separate Bedrock and Lex constructs into two distinct stacks:

1. **BedrockKbStack** (`lib/bedrock-kb-stack.ts`)
   - Handles Amazon Bedrock components
   - Creates and manages the knowledge base
   - Configures the Bedrock agent and action groups
   - Manages S3 buckets for document storage

2. **LexBotStack** (`lib/lex-bot-stack.ts`)
   - Handles Amazon Lex components
   - Creates and configures the Lex bot
   - Sets up the fallback Lambda function
   - Integrates with the Bedrock agent

The stacks are connected through props passed to the LexBotStack, which receives a reference to the BedrockKbStack to access the Bedrock agent details needed for integration.

## Key Changes
- Separated concerns between Bedrock and Lex resources
- Improved maintainability by isolating different service components
- Maintained the same functionality while providing better organization
- Added proper stack dependencies through props

## Usage
The stacks are deployed through the CDK app entry point (`bin/lex-bedrock-agent-kb.ts`), which creates both stacks and handles their interconnection.