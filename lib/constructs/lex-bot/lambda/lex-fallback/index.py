import json
import os
# import logging
from aws_lambda_powertools import Logger, Tracer
import boto3
import uuid
from botocore.config import Config

# from classes import bedrock_agent_runtime_wrapper 
from botocore.exceptions import ClientError

tracer = Tracer()
logger = Logger()
config = Config(read_timeout=1000)
bedrock_agent = boto3.client('bedrock-agent-runtime', config=config)

# --- Intent handler ---
@tracer.capture_method
def handle_fallback(intent_request, context):
    logger.debug("intent request for fallback:%s", json.dumps(intent_request))
    
    try:
        # Extract the user's input from the Lex event
        input_text = intent_request['inputTranscript']
        logger.debug("input_text=%s",input_text)
        
        # Get response from Bedrock agent
        agent_response = invoke_bedrock_agent(input_text)
        logger.debug("agent_response=%s",agent_response)
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
        logger.exception(f"Error handling Lex event: {str(e)}")
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
    
@tracer.capture_method
def invoke_bedrock_agent(input_text):

    try:
        bedrock_agent = boto3.client('bedrock-agent-runtime')
        enable_bedrock_agent_trace = os.getenv('ENABLE_BEDROCK_AGENT_TRACE', False)

        agent_id = os.environ['BEDROCK_AGENT_ID']
        agent_alias_id = os.environ['BEDROCK_AGENT_ALIAS_ID']
        session_id = str(uuid.uuid4())
        prompt = input_text
        logger.debug("agent_id=%s, agent_alias_id=%s, session_id=%s, prompt=%s", agent_id, agent_alias_id, session_id, prompt)
        wrapper = BedrockAgentRuntimeWrapper(bedrock_agent, enable_bedrock_agent_trace=True)
        response =  wrapper.invoke_agent(agent_id, agent_alias_id, session_id, prompt)
        logger.debug("response:%s", response)

        return response
    except Exception as e:
        logger.exception(f"Error invoking Bedrock agent: {str(e)}")
        return "I apologize, but I'm having trouble accessing the restaurant agent right now."

# --- Intents ---
@logger.inject_lambda_context
@tracer.capture_lambda_handler
def lambda_handler(event, context):
    """
    Route the incoming request based on intent.
    The JSON body of the request is provided in the event slot.
    """
    logger.debug('event.bot.name={}'.format(event['bot']['name']))

    return handle_fallback(event,context)


class BedrockAgentRuntimeWrapper:
    """Encapsulates Amazon Bedrock Agents Runtime actions."""

    def __init__(self, runtime_client, enable_bedrock_agent_trace):
        """
        :param runtime_client: A low-level client representing the Amazon Bedrock Agents Runtime.
                               Describes the API operations for running
                               inferences using Bedrock Agents.
        """
        self.agents_runtime_client = runtime_client
        self.enable_bedrock_agent_trace = enable_bedrock_agent_trace

    # snippet-end:[python.example_code.bedrock-agent-runtime.BedrockAgentRuntimeWrapper.decl]

    # snippet-start:[python.example_code.bedrock-agent-runtime.InvokeAgent]
    @tracer.capture_method
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

        logger.debug("agent_id=%s, agent_alias_id=%s, session_id=%s, prompt=%s, enable_bedrock_agent_trace=%s", agent_id, agent_alias_id, session_id, prompt, self.enable_bedrock_agent_trace)

        try:
            # Note: The execution time depends on the foundation model, complexity of the agent,
            # and the length of the prompt. In some cases, it can take up to a minute or more to
            # generate a response.
            response = self.agents_runtime_client.invoke_agent(
                agentId=agent_id,
                agentAliasId=agent_alias_id,
                sessionId=session_id,
                inputText=prompt,
                enableTrace=True
            )

            logger.debug("response=%s", response)

            completion = ""
            citations = []
            trace = {}

            has_guardrail_trace = False
            for event in response.get("completion"):
                # Combine the chunks to get the output text
                if "chunk" in event:
                    chunk = event["chunk"]
                    completion += chunk["bytes"].decode()
                    if "attribution" in chunk:
                        citations = citations + chunk["attribution"]["citations"]

                # Extract trace information from all events
                if "trace" in event:
                    for trace_type in ["guardrailTrace", "preProcessingTrace", "orchestrationTrace", "postProcessingTrace"]:
                        if trace_type in event["trace"]["trace"]:
                            mapped_trace_type = trace_type
                            if trace_type == "guardrailTrace":
                                if not has_guardrail_trace:
                                    has_guardrail_trace = True
                                    mapped_trace_type = "preGuardrailTrace"
                                else:
                                    mapped_trace_type = "postGuardrailTrace"
                            if trace_type not in trace:
                                trace[mapped_trace_type] = []
                            trace[mapped_trace_type].append(event["trace"]["trace"][trace_type])

            logger.debug(f"completion: {completion}")
            logger.debug(f"trace: {trace}")

        except ClientError as e:
            logger.exception(f"Couldn't invoke agent. {e}")
            raise

        return completion
        # return {
        #     "output_text": completion,
        #     "citations": citations,
        #     "trace": trace
        # }