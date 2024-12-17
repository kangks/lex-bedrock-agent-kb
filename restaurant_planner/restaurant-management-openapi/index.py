import requests
import json
import os
from typing import Dict, Optional, Any
from pydantic import BaseModel, Field
from datetime import date, datetime, time, timedelta
from typing_extensions import Annotated

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import BedrockAgentResolver
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.event_handler.openapi.params import Body, Query, Path

tracer = Tracer()
logger = Logger()
app = BedrockAgentResolver(debug=False)

@app.post("/booking", 
          description="Create a restaurant booking for the reservation",
          operation_id="1" # to meet Claude 3.5 requirement of HttpVerb__ActionName__OperationId matches the regex ^[a-zA-Z0-9_-]{1,64}$ https://docs.anthropic.com/en/docs/build-with-claude/tool-use#specifying-tools
)
@tracer.capture_method
def create_booking(
    booking_date: Annotated[date, Body(description="The date of the booking")],
    booking_time: Annotated[time, Body(description="The time of the booking, in HH:MM")],
    booking_name: Annotated[str, Body(description="Name of the person reservation to be made to")],
    num_guests: Annotated[int, Body(description="The number of guests for the booking")],
    ) -> Dict:
    """Create a new restaurant booking.
    
    Args:
        booking_details (dict): Details of the booking request containing:
            - booking_date (str): The date of booking in YYYY-MM-DD format
            - booking_name (str): Name for the reservation
            - booking_time (str): The time of booking in HH:MM format
            - num_guests (str): Number of guests as a string
        
    Returns:
        dict: The response message confirming booking creation
        
    Raises:
        requests.HTTPError: If the request fails, including 404 if params are missing
    """
    base_url = os.environ.get('RESTAURANT_API_BASE_URL')
    if not base_url:
        raise ValueError("RESTAURANT_API_BASE_URL environment variable is not set")

    booking_requests = {
        "date": booking_date.strftime("%Y-%m-%d"),
        "name": booking_name,
        "hour": booking_time.strftime("%H:%M"),
        "num_guests": num_guests
    }

    url = f"{base_url}/booking"
    logger.debug(f"Booking details: {booking_requests}")
    response = requests.post(url, json=booking_requests)
    logger.debug(f"Response: {response}")
    response.raise_for_status()
    return response.json()

@app.get("/bookings", 
         description="Retrieve a restaurant reservation from a given booking ID or booking number",
         operation_id="2"
         )
@tracer.capture_method
def get_bookings(
    booking_id: Annotated[str, Query(description="Booking ID for retrieval of bookings")]
    ) -> Dict:
    """Retrieve details of a restaurant booking.
    
    Args:
        booking_id (str): booking ID of the reservation to retrieve
        
    Returns:
        dict: The booking details
        
    Raises:
        requests.HTTPError: If the request fails, including 404 if booking not found
    """
    base_url = os.environ.get('RESTAURANT_API_BASE_URL')
    if not base_url:
        raise ValueError("RESTAURANT_API_BASE_URL environment variable is not set")

    url = f"{base_url}/booking/{booking_id}"
    response = requests.get(url)
    logger.debug(f"Booking details: {booking_id}")
    logger.debug(f"Response: {response}")
    response.raise_for_status()
    return response.json()

@app.delete("/bookings", 
            description="Cancel a restaurant reservation from a given booking ID or booking number",
            operation_id="3"
            )
@tracer.capture_method
def delete_bookings(
    booking_id: Annotated[str, Query(description="Booking ID for cancelation of bookings")]
    ) -> Dict:
    """Delete a restaurant booking.
    
    Args:
        booking_id (str): ID of the booking to delete
        
    Returns:
        dict: The response message confirming deletion
        
    Raises:
        requests.HTTPError: If the request fails, including 404 if booking not found
    """
    base_url = os.environ.get('RESTAURANT_API_BASE_URL')
    if not base_url:
        raise ValueError("RESTAURANT_API_BASE_URL environment variable is not set")

    url = f"{base_url}/booking/{booking_id}"
    response = requests.delete(url)
    response.raise_for_status()
    return response.json()

@logger.inject_lambda_context
@tracer.capture_lambda_handler
def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler function for restaurant booking operations.
    
    Args:
        event (Dict[str, Any]): Lambda event from Bedrock Agent containing:
            - apiPath: The API path being called
            - requestBody: Request body for POST operations
            - pathParameters: Path parameters for operations
            - httpMethod: The HTTP method (GET, POST, DELETE)
        context (Any): Lambda context
        
    Returns:
        Dict[str, Any]: Operation response with required Bedrock Agent format
    """
    try:
        # Get the base URL from environment variable
        base_url = os.environ.get('RESTAURANT_API_BASE_URL')
        if not base_url:
            raise ValueError("RESTAURANT_API_BASE_URL environment variable is not set")
        
        logger.debug(f"Event: {event}")
        logger.debug(f"Context: {context}")

        bedrock_response = app.resolve(event, context)
        return bedrock_response
        
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return {
            "messageVersion": "1.0",
            "error": {
                "message": str(e),
                "code": "BookingOperationError"
            }
        }

if __name__ == "__main__":  
   # This displays the autogenerated openapi schema by aws_lambda_powertools
    print(
        app.get_openapi_json_schema(
            title="Restaurant booking API",
            version="1.0.0",
            description="API to make a booking for a restaurant reservation",
            tags=["restaurant", "food_agent"],
        ),
    )