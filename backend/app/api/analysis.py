import os
import json
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.tools.sql_analysis import DuckDBQueryEngine

router = APIRouter(prefix="/analysis", tags=["analysis"])

METADATA_FILE = os.path.join(os.getcwd(), "storage", "datasets_metadata.json")
STORAGE_DIR = os.path.join(os.getcwd(), "storage", "datasets")


def _resolve_dataset_file(dataset_id: str) -> str:
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                meta = json.load(f)
                if dataset_id in meta and "file_path" in meta[dataset_id]:
                    target = meta[dataset_id]["file_path"]
                    if os.path.exists(target):
                        return os.path.abspath(target)
        except Exception as e:
            print(f"[Resolver Warning] Metadata lookup failed: {e}")

    if os.path.exists(STORAGE_DIR):
        for fname in os.listdir(STORAGE_DIR):
            if fname.startswith(dataset_id):
                return os.path.abspath(os.path.join(STORAGE_DIR, fname))

    if os.path.exists(dataset_id):
        return os.path.abspath(dataset_id)

    fallback_path = os.path.abspath("Admission_Predict.csv")
    if os.path.exists(fallback_path):
        return fallback_path

    fallback_churn = os.path.abspath("Churn_Modelling.csv")
    if os.path.exists(fallback_churn):
        return fallback_churn

    raise FileNotFoundError(f"Dataset file with ID '{dataset_id}' could not be located.")


class NotebookExportRequest(BaseModel):
    dataset_name: str
    dataset_id: str
    queries: List[Dict[str, Any]]


@router.post("/export-notebook")
async def export_jupyter_notebook(payload: NotebookExportRequest) -> Dict[str, Any]:
    """Generates a valid Jupyter Notebook JSON reproducing all executed SQL queries."""
    cells = [
        {
            "cell_type": "markdown",
            "metadata": {},
            "source": [
                f"# DataPilot Autonomous Analysis Notebook\n",
                f"**Dataset:** `{payload.dataset_name}`\n\n",
                "This notebook reproduces the exact DuckDB SQL analyses conducted during the DataPilot session."
            ]
        },
        {
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [
                "import duckdb\n",
                "import pandas as pd\n\n",
                f"# Connect DuckDB in-memory engine\n",
                f"con = duckdb.connect()\n",
                f"con.execute(\"CREATE VIEW dataset AS SELECT * FROM read_csv_auto('{payload.dataset_name}')\")\n",
                "print('Dataset view initialized successfully.')"
            ]
        }
    ]

    for idx, item in enumerate(payload.queries):
        inquiry = item.get("inquiry", f"Query {idx+1}")
        sql = item.get("sql")
        if sql:
            cells.append({
                "cell_type": "markdown",
                "metadata": {},
                "source": [f"### Analysis Step {idx+1}: {inquiry}"]
            })
            cells.append({
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    f"query_{idx+1} = \"\"\"{sql}\"\"\"\n",
                    f"df_{idx+1} = con.execute(query_{idx+1}).df()\n",
                    f"df_{idx+1}"
                ]
            })

    notebook = {
        "cells": cells,
        "metadata": {
            "language_info": {"name": "python", "version": "3.10"},
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}
        },
        "nbformat": 4,
        "nbformat_minor": 2
    }
    return notebook