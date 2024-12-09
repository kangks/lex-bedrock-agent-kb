import json
import os
import logging
import boto3
import uuid
from botocore.config import Config

# from classes import bedrock_agent_runtime_wrapper 
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)
config = Config(read_timeout=1000)
bedrock_agent = boto3.client('bedrock-agent-runtime', config=config)

# --- Intent handler ---
def handle_fallback(intent_request, context):
    logger.debug("intent request for fallback:%s", json.dumps(intent_request))
    
    try:
        # Extract the user's input from the Lex event
        input_text = intent_request['inputTranscript']
        logger.debug("input_text=%s",input_text)
        
        # Get response from Bedrock agent
        agent_response = invoke_bedrock_agent(input_text)
        
        # Format response for Lex
        return {
            "sessionState": {
                "dialogAction": {
                    "type": "Close"
                },
                "intent": {
                    "name": "FallbackIntent",
                    "state": "Fulfilled"
                }
            },
            "messages": [
                {
                    "contentType": "PlainText",
                    "content": agent_response
                }
            ]
        }
    except Exception as e:
        logger.error(f"Error handling Lex event: {str(e)}")
        return {
            "sessionState": {
                "dialogAction": {
                    "type": "Close"
                },
                "intent": {
                    "name": "FallbackIntent",
                    "state": "Failed"
                }
            },
            "messages": [
                {
                    "contentType": "PlainText",
                    "content": "I apologize, but I'm having trouble processing your request right now."
                }
            ]
        }
    
def invoke_bedrock_agent(input_text):
    bedrock_agent = boto3.client('bedrock-agent-runtime')
    wrapper = BedrockAgentRuntimeWrapper(bedrock_agent)

    agent_id = os.environ['BEDROCK_AGENT_ID']
    agent_alias_id = os.environ['BEDROCK_AGENT_ALIAS_ID']
    session_id = str(uuid.uuid4())
    prompt = input_text

    try:
        response =  wrapper.invoke_agent(agent_id, agent_alias_id, session_id, prompt)

        logger.debug("response:%s", response)

        return response
    except Exception as e:
        logger.error(f"Error invoking Bedrock agent: {str(e)}")
        return "I apologize, but I'm having trouble accessing the book information right now."

# --- Intents ---

def lambda_handler(event, context):
    """
    Route the incoming request based on intent.
    The JSON body of the request is provided in the event slot.
    """
    logger.debug('event.bot.name={}'.format(event['bot']['name']))

    return handle_fallback(event,context)


class BedrockAgentRuntimeWrapper:
    """Encapsulates Amazon Bedrock Agents Runtime actions."""

    def __init__(self, runtime_client):
        """
        :param runtime_client: A low-level client representing the Amazon Bedrock Agents Runtime.
                               Describes the API operations for running
                               inferences using Bedrock Agents.
        """
        self.agents_runtime_client = runtime_client

    # snippet-end:[python.example_code.bedrock-agent-runtime.BedrockAgentRuntimeWrapper.decl]

    # snippet-start:[python.example_code.bedrock-agent-runtime.InvokeAgent]
    def invoke_agent(self, agent_id, agent_alias_id, session_id, prompt):
        """
        Sends a prompt for the agent to process and respond to.

        :param agent_id: The unique identifier of the agent to use.
        :param agent_alias_id: The alias of the agent to use.
        :param session_id: The unique identifier of the session. Use the same value across requests
                           to continue the same conversation.
        :param prompt: The prompt that you want Claude to complete.
        :return: Inference response from the model.
        """

        logger.debug("agent_id=%s, agent_alias_id=%s, session_id=%s, prompt=%s", agent_id, agent_alias_id, session_id, prompt)

        try:
            # Note: The execution time depends on the foundation model, complexity of the agent,
            # and the length of the prompt. In some cases, it can take up to a minute or more to
            # generate a response.
            response = self.agents_runtime_client.invoke_agent(
                agentId=agent_id,
                agentAliasId=agent_alias_id,
                sessionId=session_id,
                inputText=prompt,
            )

            completion = ""

            for event in response.get("completion"):
                chunk = event["chunk"]
                completion = completion + chunk["bytes"].decode()

        except ClientError as e:
            logger.error(f"Couldn't invoke agent. {e}")
            raise

        return completion