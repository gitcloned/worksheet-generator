import json
import uuid
import os
from google import genai
from google.genai import types
from google.adk.tools import ToolContext
from .prompts import GENERATOR_PROMPT


async def generate_test(
    topic: str,
    board: str,
    grade: str,
    book: str,
    tool_context: ToolContext,
) -> str:
    """
    Generate a practice test for a student based on their topic, board, grade, and book.

    Args:
        topic: The subject/topic to test (e.g., "Simple Equations", "Photosynthesis").
        board: Educational board (e.g., "CBSE", "ICSE", "IGCSE").
        grade: Student grade or class (e.g., "Grade 7", "Class 10").
        book: Textbook name (e.g., "NCERT Mathematics", "Selina Physics").
        tool_context: ADK tool context for session state access.

    Returns:
        JSON string containing the full test with questions, options, and answers.
    """
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    prompt = (
        f"Generate a practice test for:\n"
        f"- Topic: {topic}\n"
        f"- Board: {board}\n"
        f"- Grade: {grade}\n"
        f"- Book: {book}\n\n"
        f"Use your knowledge of the {board} curriculum for {grade} to ensure questions "
        f"match the actual syllabus and difficulty level. Follow the output format exactly."
    )

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
        config=types.GenerateContentConfig(
            system_instruction=GENERATOR_PROMPT,
            response_mime_type="application/json",
            temperature=0.3,
        ),
    )

    raw = response.text.strip()
    test_data = json.loads(raw)

    if "test_id" not in test_data:
        test_data["test_id"] = str(uuid.uuid4())

    # Store the full test (with answers) in session state for later evaluation
    tool_context.state["current_test"] = test_data

    return json.dumps(test_data)
