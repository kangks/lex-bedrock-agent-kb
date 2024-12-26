# Bedrock Computer use

Computer use is a new Anthropic Claude model capability available with Anthropic Claude 3.5 Sonnet v2 only. With computer use, Claude can help you automate tasks through basic GUI actions.

## To run
1. Build the image, such as `$ podman build -t computer_use .`
2. Runs the container with AWS credentials, and 
```
podman run -it --rm -v ${PWD}/logs:/home/computeruse/app/logs \
-e AWS_ACCESS_KEY_ID=$(aws --profile ${AWS_PROFILE} configure get aws_access_key_id) \
-e AWS_SECRET_ACCESS_KEY=$(aws --profile ${AWS_PROFILE} configure get aws_secret_access_key) \
-p 5900:5900 computer_use \
'Retrieve the latest Singapore COE bidding price and estimate the next bidding for Category A'
```
3. You can connect to the view only VNC via port 5900 

![video](assets/computer_use.gif)

4. If the execution is successful, the output should be something as below:
```
Bedrock: [{'text': 'Based on the latest COE bidding results for December 2024 2nd Open Bidding Exercise that ended on 18/12/2024, here are the details for Category A:\n\nCurrent Category A (Cars up to 1600cc & 130bhp):\n- Quota: 1,035\n- Quota Premium (QP): $96,000\n- Prevailing Quota Premium (PQP): $97,747\n\nFor projecting the next bidding, we need to consider several factors:\n\n1. Recent trend: The Category A COE price has shown some stability around the $95,000-$100,000 range\n\n2. Key factors that might influence the next bidding:\n- Quota for the next bidding exercise (if announced)\n- Seasonal demand (typically higher during the start of the year)\n- Recent policy changes or announcements\n- Economic conditions\n\nBased on these factors, we can project that the next Category A COE bidding price is likely to:\n- Remain relatively stable with a possible slight increase due to typical higher demand at the start of the year\n- Expected range: $96,000 - $98,000\n\nPlease note that this is a projection based on current available data and market conditions. Actual COE prices can be affected by various unforeseen factors and market dynamics.\n\nWould you like me to provide more specific analysis of any particular aspect of the COE bidding results or factors affecting the projection?'}]
```

# Implementation Details

## computer_use.py Overview
The `computer_use.py` script implements a Bedrock-powered computer interaction system with the following key components:

1. `BedrockComputerInteraction` class:
   - Manages interactions with AWS Bedrock service using Claude 3.5 Sonnet v2
   - Handles authentication and session management with AWS
   - Implements a main interaction loop for processing user inputs and Bedrock responses
   - Supports tool actions and screenshot capabilities

2. `SaveScreenshot` class:
   - Manages screenshot functionality for capturing computer screen during interactions
   - Stores images in the ./output_images directory

## Main Functionality
- The application runs an interactive loop that:
  - Takes user input
  - Sends requests to Bedrock
  - Processes responses and executes tool actions
  - Captures screenshots when needed
  - Supports continuous dialogue until the user exits

## Docker Container Details
The application runs in a Docker container with the following key components:
- Base image: Ubuntu 22.04
- Required packages:
  - Python 3 and pip
  - X11 virtual framebuffer (xvfb)
  - VNC server for remote viewing
  - TigerVNC for VNC server functionality
  - GUI automation tools and dependencies
- Environment setup:
  - Configures VNC server
  - Sets up virtual display
  - Installs Python dependencies
  - Creates necessary directories for screenshots

## Runtime Configuration
- Exposes port 5900 for VNC access
- Mounts local logs directory
- Requires AWS credentials as environment variables
- Supports passing custom input commands

# References
* [PyAutoGUI](https://pyautogui.readthedocs.io/en/latest/)
   * Alternatives are [xdotool](https://github.com/jordansissel/xdotool/tree/master)
* [Anthropic Computer Use](https://docs.anthropic.com/en/docs/build-with-claude/computer-use) and the [sample code on Github](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo)
* [API doc for Bedrock converse](https://boto3.amazonaws.com/v1/documentation/api/1.35.8/reference/services/bedrock-runtime/client/converse.html)