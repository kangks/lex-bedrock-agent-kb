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
app = BedrockAgentResolver()

class CreateBookRequest(BaseModel):
    booking_date: date = Field(..., description="The date of the booking")
    name: str = Field(..., description="Name to identify your reservation")
    booking_time: time = Field(..., description="The hour of the booking")
    num_guests: int = Field(..., description="The number of guests for the booking")

@app.post("/create_booking", description="Create a booking")
@tracer.capture_method
def create_booking(
    booking_details: Annotated[CreateBookRequest, Body(description="Details of the booking request")]
    ) -> Dict:
    """Create a new restaurant booking.
    
    Args:
        booking_details (dict): Details of the booking request containing:
            - date (str): The date of booking in YYYY-MM-DD format
            - name (str): Name for the reservation
            - hour (str): The time of booking in HH:MM format
            - num_guests (str): Number of guests as a string
        
    Returns:
        dict: The response message confirming booking creation
        
    Raises:
        requests.HTTPError: If the request fails, including 404 if params are missing
    """
    base_url = os.environ.get('RESTAURANT_API_BASE_URL')
    if not base_url:
        raise ValueError("RESTAURANT_API_BASE_URL environment variable is not set")

    # booking_details = booking_details.model_dump_json()
    book_requests = {
        "date": booking_details.booking_date.strftime("%Y-%m-%d"),
        "name": booking_details.name,
        "hour": booking_details.booking_time.strftime("%H:%M"),
        "num_guests": booking_details.num_guests
    }
    
    url = f"{base_url}/booking"
    logger.debug(f"Booking details: {book_requests}")
    response = requests.post(url, json=book_requests)
    logger.debug(f"Response: {response}")
    response.raise_for_status()
    return response.json()

@app.get("/get_booking/{booking_id}", description="Retrieve a booking")
@tracer.capture_method
def get_booking(
    booking_id: Annotated[str, Path(description="The ID of the booking to retrieve")]  
    ) -> Dict:
    """Retrieve details of a restaurant booking.
    
    Args:
        booking_id (str): ID of the booking to retrieve
        
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

@app.delete("/delete_booking/{booking_id}", description="Cancel a booking")
@tracer.capture_method
def delete_booking(
    booking_id: Annotated[str, Path(max_length=200, strict=True, description="The ID of the booking to deleted")]
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
        
        # Initialize the API client
        # client = RestaurantBookingClient(base_url)

        logger.debug(f"Event: {event}")
        logger.debug(f"Context: {context}")

        return app.resolve(event, context)  
    
        # # Extract API details from the event
        # api_path = event.get('apiPath', '')
        # http_method = event.get('httpMethod', '').upper()
        # request_body = event.get('requestBody', {})
        # path_parameters = event.get('pathParameters', {})
        
        # # Handle booking operations based on HTTP method and path
        # if http_method == 'POST' and api_path == '/booking':
        #     response = client.create_booking(request_body)
        # elif http_method == 'GET' and '/booking' in api_path:
        #     booking_id = path_parameters.get('id')
        #     if not booking_id:
        #         raise ValueError("Booking ID is required for GET operation")
        #     response = client.get_booking(booking_id)
        # elif http_method == 'DELETE' and '/booking' in api_path:
        #     booking_id = path_parameters.get('id')
        #     if not booking_id:
        #         raise ValueError("Booking ID is required for DELETE operation")
        #     response = client.delete_booking(booking_id)
        # else:
        #     raise ValueError(f"Unsupported operation: {http_method} {api_path}")
        
        # return {
        #     "messageVersion": "1.0",
        #     "response": response
        # }
        
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
            description="API for booking a table in the restaurant",
            tags=["restaurant"],
        ),
    )