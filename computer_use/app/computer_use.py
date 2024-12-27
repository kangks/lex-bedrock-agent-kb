from io import BytesIO
import logging
import boto3
import platform
from botocore.exceptions import ClientError
from botocore.config import Config
from time import sleep
from datetime import datetime

import sys
import subprocess

from pprint import pformat
import Xlib.display
import pyautogui
import os
import sys
if(os.environ.get('DISPLAY')):
    pyautogui._pyautogui_x11._display = Xlib.display.Display(os.environ.get('DISPLAY'))

logging.basicConfig(level=logging.INFO)
# logFormatter = logging.Formatter("%(asctime)s [%(threadName)-12.12s] [%(levelname)-5.5s]  %(message)s")
logFormatter = logging.Formatter("%(asctime)s [%(filename)s:%(lineno)s - %(funcName)20s() ] %(message)s")
rootLogger = logging.getLogger()

logPath="logs"
fileHandler = logging.FileHandler(f"{os.path.dirname(__file__)}/logs/{os.path.basename(__file__)}.log")
fileHandler.setFormatter(logFormatter)
rootLogger.addHandler(fileHandler)

consoleHandler = logging.StreamHandler()
consoleHandler.setFormatter(logFormatter)
rootLogger.addHandler(consoleHandler)

logger = logging.getLogger(__name__)

THROTTLING_DELAY_SECONDS=int(os.environ.get("THROTTLING_DELAY_SECONDS",10))

class SaveScreenshot:
    def __init__(self):
        self.image_location="./output_images"
        self.counter=0
    
    def get_and_save_screen_shot(self):
        screenshot = pyautogui.screenshot()
        buffer = BytesIO()
        screenshot.save(buffer, format='PNG')
        screenshot_filename=f"{os.path.dirname(__file__)}/logs/screen_shot_{self.counter}.png"
        self.counter+=1
        logger.info(f"saving screenshot to {screenshot_filename}")
        screenshot.save(screenshot_filename, format='PNG')
        image_bytes = buffer.getvalue()
        buffer.close()
        return image_bytes
    
class BedrockComputerInteraction:
    def __init__(self, region_name, model_id, system, tool_config, additional_request_fields):
        boto3_config = Config(
            region_name = 'us-east-1',
            signature_version = 'v4',
            retries = {
                'max_attempts': 1,
                'mode': 'standard'
            }
        )
        session = boto3.Session(
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
            aws_session_token=os.environ.get('AWS_SESSION_TOKEN')
        )
        self.client = session.client("bedrock-runtime", config=boto3_config)
        # self.client = boto3.client('bedrock-runtime', region_name=region_name)
        self.model_id = model_id
        self.system = system
        self.tool_config = tool_config
        self.additional_request_fields = additional_request_fields
        self.messages = []
        self.screenshot = SaveScreenshot()

    def send_to_bedrock(self):
        """Send messages to Bedrock and get the response using boto3."""
        try:            
            sleep(THROTTLING_DELAY_SECONDS)
            response = self.client.converse(
                modelId=self.model_id,
                messages=self.messages,
                system=self.system,
                toolConfig=self.tool_config,
                additionalModelRequestFields=self.additional_request_fields
            )
            return response
        except ClientError as e:
            # Check if the error is a ThrottlingException
            if e.response['Error']['Code'] == 'ThrottlingException':
                logger.exception(f"Bedrock throttling error: {e}")
            else:
                # Handle other client errors
                logger.exception(f"An error occurred: {e}")        
            return None
        except Exception as e:
            for i, messages in enumerate(self.messages):
                logger.error(f"message {i}:")
                logger.error(pformat(messages))
            logger.exception(f"Error communicating with Bedrock: {e}")
            return None
        
    def execute_tool_command(self, command, input_data, tool_use_id):
        logger.info(f"Executing tool commnd: {command} for tool_use_id: {tool_use_id}")

        logger.info(f"command:{command}, input_data:{input_data}")
        result = subprocess.run(command, shell=True, stdout=subprocess.PIPE).stdout.decode('utf-8')
        logger.info(f"result:{result}")
        response={
            'toolResult': {
                'toolUseId': tool_use_id,
                'content':[
                    {
                        'text': {result}
                    }
                ]
            }
        }                

        return response 

    def execute_tool_action(self, action, input_data, tool_use_id):
        """Simulate executing a tool action from Bedrock."""
        # Placeholder logic for tool execution
        # Replace with actual tool execution logic
        # response = {}
        logger.info(f"Executing tool action: {action} for tool_use_id: {tool_use_id}")
        match action:
            case 'screenshot':
                logger.info(f"screenshot, input_data:{input_data}")
                # screenshot = pyautogui.screenshot()
                # buffer = BytesIO()
                # screenshot.save(buffer, format='PNG')
                # image_bytes = buffer.getvalue()
                # buffer.close()
                response={
                    'toolResult': {
                        'toolUseId': tool_use_id,
                        'content':[
                            {
                                'text': 'OK'
                            },
                            {
                                'image': {
                                    'format': 'png',    
                                    'source': {
                                        'bytes': self.screenshot.get_and_save_screen_shot()
                                    }
                                }
                            }                            
                        ],
                        'status':'success'
                    }
                }                
            #     screenshot = get_screenshot()
            #     print(screenshot)
            case 'type':
                text = input_data.get('text')
                logger.info(f"type:{text}, input_data:{input_data}")
                pyautogui.write(input_data.get('text'))
                response={
                    'toolResult': {
                        'toolUseId': tool_use_id,
                        'content':[
                            {
                                'text': 'OK'
                            }
                        ]
                    }
                }                
            case 'key':
                key = input_data.get('text')
                logger.info(f"key:{key}, input_data:{input_data}")
                if key.lower() == 'return':
                    key = 'enter'
                    pyautogui.press(key)
                elif '_' in key: # for example page_down
                    key = key.replace("_","").lower()
                    pyautogui.press(key)
                elif '+' in key:
                    keys = key.split('+')
                    logger.info(f"keys:{keys}, using pyautogui.hotkey()")
                    pyautogui.hotkey(*keys)
                else:
                    pyautogui.press(input_data.get('text'))

                response={
                    'toolResult': {
                        'toolUseId': tool_use_id,
                        'content':[
                            {
                                'text': 'OK'
                            }
                        ]
                    }
                }                
            case 'left_click':
                logger.info(f"left_click, input_data:{input_data}")
                pyautogui.click()
                sleep(0.25)
                response={
                    'toolResult': {
                        'toolUseId': tool_use_id,
                        'content':[
                            {
                                'text': 'OK'
                            }
                        ]
                    }
                }                
            case 'mouse_move':
                coordinate = input_data['coordinate']
                logger.info(f"coordinate: {coordinate}, input_data:{input_data}")
                # coord_str = coordinate.strip('[]')
                # x, y = map(int, coord_str.split(','))
                pyautogui.moveTo(coordinate[0],coordinate[1])
                response={
                    'toolResult': {
                        'toolUseId': tool_use_id,
                        'content':[
                            {
                                'text': 'OK'
                            }
                        ]
                    }
                }                
            case _:
                logger.exception("Unsupported action received")
        return response 

    def add_message(self, role, content):
        """Add a message to the conversation history, schema following https://boto3.amazonaws.com/v1/documentation/api/1.35.8/reference/services/bedrock-runtime/client/converse.html."""
        self.messages.append({"role": role, "content": content})

    def get_tool_use(self, content):
        for item in content:
            if 'toolUse' in item:
                yield item['toolUse']

    def main_loop(self, user_input):
        print("Welcome to the Bedrock Interaction Script.")
        # user_input = input("Please enter your initial input: ")
        # user_input = "Retrieve the latest Singapore COE bidding price"

        logger.info(f'user_input:{user_input}')
        # Add the initial user input
        self.add_message(role="user", content=[{"text": user_input}])

        while True:
            # Step 1: Send messages to Bedrock
            bedrock_response = self.send_to_bedrock()

            if not bedrock_response:
                logger.exception("Failed to get a response from Bedrock. Exiting.")
                break

            logger.info(f'bedrock_response:{bedrock_response}')

            # Step 2: Handle Bedrock response
            stop_reason = bedrock_response.get("stopReason")
            message_content = bedrock_response.get("output", {}).get("message", {}).get("content")

            logger.info(f'stop_reason:{stop_reason}')
            logger.info(f'message_content:{message_content}')

            if stop_reason == "tool_use":
                tool_result_contents=[]
                for toolUse in self.get_tool_use(message_content):
                    # action = bedrock_response.get("action")
                    input_data = toolUse['input']
                    tool_use_id = toolUse['toolUseId']
                    if(input_data.get('action')):
                        action = input_data.get('action')
                        logger.info(f'action:{action}')
                        tool_result = self.execute_tool_action(action, input_data, tool_use_id)
                        tool_result_contents.append(tool_result)
                    elif(input_data.get('command')):
                        command = input_data.get('command')
                        logger.info(f'command:{command}')
                        tool_result = self.execute_tool_command(command, input_data, tool_use_id)
                        tool_result_contents.append(tool_result)
                    elif(input_data.get('type')):
                        input_data_type = input_data.get('type')
                        if isinstance(input_data_type, dict):
                            command = input_data_type.get('command')
                        else:
                            command = input_data_type
                        logger.info(f'command:{command}')
                        tool_result = self.execute_tool_command(command, input_data, tool_use_id)
                        tool_result_contents.append(tool_result)
                    else:
                        # dummy response
                        tool_result_contents.append({
                            'toolResult': {
                                'toolUseId': tool_use_id,
                                'content':[{'text': 'OK'}
                                ]
                            }
                        })
                        
                # Add assistant message and user tool result
                self.add_message(role="assistant", content=message_content)
                self.add_message(role="user", content=tool_result_contents)
            elif stop_reason == "end_turn":
                # Step 4: Reply to user and get new input or exit
                logger.info(f"Bedrock: {message_content}")
                self.add_message(role="assistant", content=message_content)
                user_input = input("Your response (or type 'exit' to end): ")
                if user_input.lower() == "exit":
                    print("Ending the interaction. Goodbye!")
                    break
                elif user_input:
                    self.add_message(role="user", content=[{"text": user_input}])
                else:
                    break
            else:
                # Handle other stop reasons if necessary
                logger.exception(f"Unexpected stop reason: {stop_reason}")
                break

if __name__ == "__main__":
    REGION_NAME = "us-east-1"  # Replace with your region
    MODEL_ID = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
    SYSTEM = [{'text': f"""<SYSTEM_CAPABILITY>
* You are utilising an Ubuntu virtual machine using {platform.machine()} architecture with internet access.
* To open web browser, please just click on the firefox icon.  Note, firefox-esr is what is installed on your system.
* When viewing a page it can be helpful to zoom out so that you can see everything on the page. Either that, or make sure you scroll down to see everything before deciding something isn't available.
* Create new tab in the Firefox if you need to open more than 1 website to complete your task.
* When browsing a web page, they take a while to run and send back to you. 
* When entering address in browser address bar, chain the actions of select and focu the address bar, check that the cursor is positioned in the address bar and address bar is being selected, enter the URL, and press enter in the same action.
* The current date is {datetime.today().strftime('%A, %B %-d, %Y')}.
</SYSTEM_CAPABILITY>

<IMPORTANT>
* When using Firefox, if a startup wizard appears, IGNORE IT.  Do not even click "skip this step".  Instead, click on the address bar where it says "Search or enter address", and enter the appropriate search term or URL there.
* Always validate the position of mouse cursor especially when selecting browser address bar.
* When viewing a page it can be helpful to zoom out so that you can see everything on the page. Either that, or make sure you scroll down to see everything before deciding something isn't available, using key pagedown.
</IMPORTANT>"""
    }]
    TOOL_CONFIG = {
        'tools': [
            {
                'toolSpec': {
                    'name': 'computer_tool',
                    'inputSchema': {
                        'json': {
                            'type': 'object'
                        }
                    }
                }
            }
        ]
    }
    ADDITIONAL_REQUEST_FIELDS = {
            "tools": [
                {
                    # https://docs.anthropic.com/en/docs/build-with-claude/computer-use#computer-tool
                    "type": "computer_20241022",
                    "name": "computer",
                    "display_height_px": int(os.environ.get("HEIGHT",768)),
                    "display_width_px": int(os.environ.get("WIDTH",1024)),
                    "display_number": int(os.environ.get("DISPLAY",':0')[1:])
                }
            ],
            "anthropic_beta": ["computer-use-2024-10-22"]
        }
    
    logger.info(f"ADDITIONAL_REQUEST_FIELDS: {ADDITIONAL_REQUEST_FIELDS}")

    interaction = BedrockComputerInteraction(
        region_name=REGION_NAME,
        model_id=MODEL_ID,
        system=SYSTEM,
        tool_config=TOOL_CONFIG,
        additional_request_fields=ADDITIONAL_REQUEST_FIELDS
    )
    if len(sys.argv) > 1:
        interaction.main_loop(sys.argv[1])
    else:
        raise ValueError(f"Missing initial input. usage: {os.path.basename(__file__)} <initial input, such as Retrieve the latest Singapore COE bidding price>")
