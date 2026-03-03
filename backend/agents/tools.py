import json
import uuid
import os
from google import genai
from google.genai import types
from google.adk.tools import ToolContext
from .prompts import (
    RESEARCHER_PROMPT,
    TOPIC_EXTRACTOR_PROMPT,
    BLUEPRINT_PROMPT,
    GENERATOR_PROMPT,
)


def _client() -> genai.Client:
    return genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


async def research_book(
    topic: str,
    board: str,
    grade: str,
    book: str,
    tool_context: ToolContext,
) -> str:
    """
    Research the textbook content for the given topic, board, grade, and book.
    Returns structured JSON with chapters, key concepts, and question formats.

    Args:
        topic: Subject area or chapter (e.g. "Light", "Simple Equations").
        board: Educational board (e.g. "CBSE", "ICSE").
        grade: Student grade (e.g. "Class 10", "Grade 7").
        book: Textbook name (e.g. "NCERT Science", "Selina Physics").
        tool_context: ADK tool context for session state access.
    """
    client = _client()

    # Step 1: grounded search — find actual book content
    search_prompt = (
        f"Research the following for a school practice test:\n"
        f"- Book: {book}\n"
        f"- Board: {board}\n"
        f"- Grade: {grade}\n"
        f"- Subject/Topic area: {topic}\n\n"
        f"Find all chapters and major topics in this subject from this specific book. "
        f"List key concepts, formulas, laws, and definitions from each chapter. "
        f"Also note the typical question formats used in {board} exams for this grade."
    )
    search_resp = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=[types.Content(role="user", parts=[types.Part(text=search_prompt)])],
        config=types.GenerateContentConfig(
            system_instruction=RESEARCHER_PROMPT,
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.1,
        ),
    )
    raw_research = search_resp.text.strip()

    # Step 2: structure the research into clean JSON
    extract_prompt = (
        f"Here are research notes about {book} ({grade}, {board}):\n\n"
        f"{raw_research}\n\n"
        f"Extract the structured topic list in the required JSON format."
    )
    extract_resp = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=[types.Content(role="user", parts=[types.Part(text=extract_prompt)])],
        config=types.GenerateContentConfig(
            system_instruction=TOPIC_EXTRACTOR_PROMPT,
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    research_data = json.loads(extract_resp.text.strip())

    # Store raw research separately — used by generate_questions, not sent to frontend
    research_data["raw_research"] = raw_research
    research_data["book"] = book
    research_data["board"] = board
    research_data["grade"] = grade

    tool_context.state["book_research"] = research_data
    return json.dumps(research_data)


async def design_blueprint(
    selected_topics: list[str],
    difficulty: str,
    duration_minutes: int,
    tool_context: ToolContext,
) -> str:
    """
    Design the paper blueprint: sections, question types, marks, and cognitive levels.

    Args:
        selected_topics: List of topic names the student wants to include.
        difficulty: "easy", "mixed", or "hard".
        duration_minutes: Exam duration — 15, 30, or 60.
        tool_context: ADK tool context for session state access.
    """
    client = _client()

    book_research = tool_context.state.get("book_research", {})
    context_note = ""
    if book_research:
        context_note = (
            f"Book: {book_research.get('book', '')}, "
            f"Grade: {book_research.get('grade', '')}, "
            f"Board: {book_research.get('board', '')}\n"
            f"Available topics: {', '.join(t['name'] for t in book_research.get('topics', []))}\n\n"
        )

    blueprint_prompt = (
        f"{context_note}"
        f"Design a paper blueprint with:\n"
        f"- Selected topics: {', '.join(selected_topics)}\n"
        f"- Difficulty: {difficulty}\n"
        f"- Duration: {duration_minutes} minutes\n\n"
        f"Follow the cognitive level distribution and marks-per-minute guidelines exactly."
    )

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=[types.Content(role="user", parts=[types.Part(text=blueprint_prompt)])],
        config=types.GenerateContentConfig(
            system_instruction=BLUEPRINT_PROMPT,
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )

    blueprint = json.loads(response.text.strip())
    blueprint["selected_topics"] = selected_topics
    tool_context.state["paper_blueprint"] = blueprint
    return json.dumps(blueprint)


async def generate_questions(tool_context: ToolContext) -> str:
    """
    Generate the full practice test using the approved blueprint and book research
    stored in session state. No parameters needed — reads state directly.

    Args:
        tool_context: ADK tool context for session state access.
    """
    client = _client()

    book_research = tool_context.state.get("book_research", {})
    blueprint = tool_context.state.get("paper_blueprint", {})

    if not blueprint:
        raise ValueError("No paper blueprint found in session state. Call design_blueprint first.")

    raw_research = book_research.get("raw_research", "No research available.")

    gen_prompt = (
        f"Generate a practice test for:\n"
        f"- Topic: {book_research.get('grade', '')} {book_research.get('book', '')}\n"
        f"- Board: {book_research.get('board', '')}\n"
        f"- Grade: {book_research.get('grade', '')}\n"
        f"- Book: {book_research.get('book', '')}\n\n"
        f"Syllabus research (use this to ground questions in actual book content):\n"
        f"{raw_research}\n\n"
        f"Paper blueprint to follow EXACTLY:\n"
        f"{json.dumps(blueprint, indent=2)}\n\n"
        f"Generate questions that match the blueprint's sections precisely."
    )

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=[types.Content(role="user", parts=[types.Part(text=gen_prompt)])],
        config=types.GenerateContentConfig(
            system_instruction=GENERATOR_PROMPT,
            response_mime_type="application/json",
            temperature=0.3,
        ),
    )

    test_data = json.loads(response.text.strip())

    if "test_id" not in test_data:
        test_data["test_id"] = str(uuid.uuid4())

    # Fill duration/marks from blueprint if generator didn't include them
    if "duration_minutes" not in test_data:
        test_data["duration_minutes"] = blueprint.get("duration_minutes")
    if "total_marks" not in test_data:
        test_data["total_marks"] = blueprint.get("total_marks")

    tool_context.state["current_test"] = test_data
    return json.dumps(test_data)
