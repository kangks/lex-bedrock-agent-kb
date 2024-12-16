import os

from typing import List
from typing_extensions import Annotated

from serpapi import GoogleSearch
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler.openapi.params import Query
from aws_lambda_powertools.event_handler import BedrockAgentResolver
from aws_lambda_powertools.utilities.typing import LambdaContext

SERPAPI_API_KEY = os.environ.get('SERPAPI_SERPAPI_API_KEY')

tracer = Tracer()
logger = Logger()
app = BedrockAgentResolver()

@app.get("/get_restaurants", description="Gets nearby restaurant results from Google Search")
@tracer.capture_method
def get_restaurants(
    food: Annotated[str, Query(description="food to be searched")]
) -> List[dict]:

    params = {
        'api_key': SERPAPI_API_KEY,
        'engine': 'google_food',               # SerpApi search engine
        'q': food
    }    

    search = GoogleSearch(params)
    results = search.get_dict()

    if results.get('error'):
        output = results['error'] + "Ask the user for more information related to the context received about the function."
    elif results.get("local_results"):
        output = results.get("local_results")
    else:
        output = results + "Unknown Error."
    return output

@logger.inject_lambda_context
@tracer.capture_lambda_handler
def lambda_handler(event: dict, context: LambdaContext):
    return app.resolve(event, context)


if __name__ == "__main__":
    # This displays the autogenerated openapi schema by aws_lambda_powertools
    print(
        app.get_openapi_json_schema(
            title="Restaurant Finder Bot API",
            version="1.0.0",
            description="Restaurant Finder API for searching the restaurant near my",
            tags=["food", "restaurant"],
        ),
    )