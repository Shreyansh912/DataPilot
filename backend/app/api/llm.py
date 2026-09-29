import re
import json
import os
from typing import Optional, Dict, Any, List
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.llm_service import get_llm_client
from app.tools.sql_analysis import DuckDBQueryEngine
from app.api.analysis import _resolve_dataset_file

router = APIRouter(prefix="/llm", tags=["llm"])


class ChatMessage(BaseModel):
    sender: str
    text: str


class GenerateRequest(BaseModel):
    prompt: str
    dataset_id: Optional[str] = None
    user_query: Optional[str] = None
    conversation_history: Optional[List[ChatMessage]] = []


@router.post("/generate")
async def generate_llm_response(payload: GenerateRequest) -> Dict[str, Any]:
    llm = get_llm_client()
    user_inquiry = payload.user_query or payload.prompt

    if payload.dataset_id:
        try:
            file_path = _resolve_dataset_file(payload.dataset_id)

            # 1. Fetch live table schema
            schema_res = DuckDBQueryEngine.execute_sql(file_path, "DESCRIBE dataset;")
            columns_schema = ""
            if schema_res.get("success"):
                cols = [f'"{r["column_name"]}"' for r in schema_res.get("data", [])]
                columns_schema = ", ".join(cols)

            # 2. Compile multi-turn conversation memory
            history_context = ""
            if payload.conversation_history:
                recent = payload.conversation_history[-4:]
                history_snippets = []
                for msg in recent:
                    clean_text = msg.text[:250].replace("\n", " ")
                    history_snippets.append(f"{msg.sender.upper()}: {clean_text}")
                history_context = "PREVIOUS CONVERSATION CONTEXT:\n" + "\n".join(history_snippets) + "\n\n"

            # 3. Formulate read-only DuckDB SQL query
            sql_prompt = (
                "You are an expert DuckDB SQL analyst. The table is strictly named `dataset`.\n"
                f"Columns available: [{columns_schema}]\n"
                f"{history_context}"
                f"Current User Inquiry: \"{user_inquiry}\"\n\n"
                "Requirements:\n"
                "- Write a single read-only DuckDB SQL query to compute the ground-truth answer.\n"
                "- Always quote column names in double quotes (e.g. \"Age\", \"Balance\", \"Exited\").\n"
                "- Resolve any relative references (e.g., 'the second one', 'those customers', 'them') using the conversation context.\n"
                "- Output ONLY the query inside a ```sql ... ``` code block. If no query is needed, reply NO_SQL."
            )

            raw_sql_resp = await llm.generate_response(sql_prompt)
            sql_match = re.search(r"```(?:sql)?\s*([\s\S]*?)\s*```", raw_sql_resp, re.IGNORECASE)
            sql_query = sql_match.group(1).strip() if sql_match else None

            computed_data = None
            if sql_query and "no_sql" not in sql_query.lower():
                query_result = DuckDBQueryEngine.execute_sql(file_path, sql_query)
                if query_result.get("success") and query_result.get("data"):
                    computed_data = query_result.get("data")

            # 4. Synthesize structured response
            if computed_data:
                first_row = computed_data[0]
                keys = list(first_row.keys())
                x_key = keys[0]
                numeric_keys = [k for k in keys if isinstance(first_row[k], (int, float))]
                y_keys = [numeric_keys[0]] if numeric_keys else [keys[1]] if len(keys) > 1 else [keys[0]]

                chart_instruction = ""
                if len(computed_data) >= 2:
                    chart_json_example = json.dumps({
                        "type": "bar",
                        "title": user_inquiry,
                        "xKey": x_key,
                        "yKeys": y_keys,
                        "data": computed_data
                    }, indent=2)
                    chart_instruction = (
                        "2. INTERACTIVE CHART BLOCK:\n"
                        "Since there are 2 or more rows, output the chart configuration strictly inside a ```chart block:\n"
                        f"```chart\n{chart_json_example}\n```\n\n"
                    )
                else:
                    chart_instruction = "2. NOTE: Do NOT output any ```chart block since this is a single scalar/aggregate metric.\n\n"

                synthesis_prompt = (
                    f"User Inquiry: \"{user_inquiry}\"\n\n"
                    f"EXACT GROUND TRUTH METRICS FROM DUCKDB (FULL DATASET):\n"
                    f"{json.dumps(computed_data, indent=2)}\n\n"
                    f"EXECUTED SQL:\n```sql\n{sql_query}\n```\n\n"
                    "FORMATTING REQUIREMENTS:\n"
                    "Structure your final response in this exact order:\n\n"
                    "1. EXECUTIVE INSIGHT:\n"
                    "Provide a 1-2 sentence plain-English summary answering the question directly with key findings.\n\n"
                    f"{chart_instruction}"
                    "3. DATA SUMMARY TABLE:\n"
                    "Present the computed numbers in a clean Markdown table with clear column headers.\n\n"
                    "4. SQL AUDIT:\n"
                    f"At the very end of your response, output the exact SQL query inside a ```sql ... ``` block:\n"
                    f"```sql\n{sql_query}\n```\n"
                    "Do NOT include template prompt labels like '1. EXECUTIVE INSIGHT:' or apologies in your text."
                )

                final_output = await llm.generate_response(synthesis_prompt)
                return {"output": final_output, "sql": sql_query}

        except Exception as err:
            print(f"[DataPilot Warning] Pipeline error: {err}")

    fallback_output = await llm.generate_response(payload.prompt)
    return {"output": fallback_output, "sql": None}


@router.post("/auto-briefing")
async def generate_auto_briefing(payload: Dict[str, str]) -> Dict[str, Any]:
    """Generates an autonomous anomaly & pattern briefing when a dataset is opened."""
    dataset_id = payload.get("dataset_id")
    if not dataset_id:
        return {"briefing": []}

    try:
        file_path = _resolve_dataset_file(dataset_id)
        llm = get_llm_client()

        schema_res = DuckDBQueryEngine.execute_sql(file_path, "DESCRIBE dataset;")
        cols = [f'"{r["column_name"]}"' for r in schema_res.get("data", [])]

        scan_prompt = (
            f"You are DataPilot Auto-Pilot. The dataset columns are: [{', '.join(cols)}].\n"
            "Write up to 3 high-impact SQL queries to detect anomalies, distributions, or strong correlations.\n"
            "Output them as a JSON list of objects: [{\"title\": \"...\", \"sql\": \"...\"}]. Only valid JSON."
        )

        plan_raw = await llm.generate_response(scan_prompt)
        match = re.search(r"\[[\s\S]*\]", plan_raw)
        insights = []

        if match:
            queries = json.loads(match.group(0))
            for item in queries[:3]:
                res = DuckDBQueryEngine.execute_sql(file_path, item["sql"])
                if res.get("success") and res.get("data"):
                    insights.append({
                        "title": item.get("title", "Pattern Detected"),
                        "data": res["data"][:3]
                    })

        return {"insights": insights}
    except Exception as e:
        print(f"[AutoBriefing Error]: {e}")
        return {"insights": []}