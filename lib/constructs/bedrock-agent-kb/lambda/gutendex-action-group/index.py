#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
# with the License. A copy of the License is located at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
# OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
# and limitations under the License.
#

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import BedrockAgentResolver

import requests

logger = Logger()
app = BedrockAgentResolver()

def get_books_from_gutendex(n: int) -> dict:
    """Return the count and first n books from the /books API."""
    api_url = "https://gutendex.com"
    response = requests.get(api_url + "/books")
    books = response.json()
    return {"count": books["count"], "books": books["results"][:n]}

@app.get("/top_books", description="Gets Top Books")
def get_top_books():
    return get_books_from_gutendex(5)


def handler(event, context):
    return app.resolve(event, context)
