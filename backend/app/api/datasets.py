import os
import uuid
import json
import io
import pandas as pd
from typing import Dict, Any
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(prefix="/datasets", tags=["datasets"])

# Directory setup
BASE_STORAGE_DIR = os.path.abspath(os.path.join(os.getcwd(), "storage", "datasets"))
METADATA_FILE = os.path.abspath(os.path.join(os.getcwd(), "storage", "datasets_metadata.json"))
os.makedirs(BASE_STORAGE_DIR, exist_ok=True)


def _load_metadata() -> Dict[str, Any]:
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_metadata(metadata: Dict[str, Any]):
    try:
        with open(METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)
    except Exception as e:
        print(f"[Metadata Save Error]: {e}")


def generate_profile(df: pd.DataFrame, filename: str, dataset_id: str, file_path: str) -> Dict[str, Any]:
    df.columns = [str(c).strip() for c in df.columns]

    total_rows = int(len(df))
    total_cols = int(len(df.columns))
    duplicate_rows = int(df.duplicated().sum())

    numeric_cols = []
    categorical_cols = []
    datetime_cols = []
    columns_profile = {}

    for col in df.columns:
        series = df[col]
        missing_count = int(series.isna().sum())
        missing_pct = round((missing_count / total_rows * 100), 2) if total_rows > 0 else 0
        cardinality = int(series.nunique(dropna=True))

        col_dict = {
            "name": col,
            "missing_count": missing_count,
            "missing_pct": missing_pct,
            "cardinality": cardinality,
        }

        if pd.api.types.is_numeric_dtype(series):
            numeric_cols.append(col)
            col_dict["category"] = "numerical"
            col_dict["dtype"] = str(series.dtype)
            clean_series = series.dropna()
            if not clean_series.empty:
                col_dict["mean"] = round(float(clean_series.mean()), 2)
                col_dict["min"] = round(float(clean_series.min()), 2)
                col_dict["max"] = round(float(clean_series.max()), 2)
            else:
                col_dict["mean"], col_dict["min"], col_dict["max"] = None, None, None

        elif pd.api.types.is_datetime64_any_dtype(series):
            datetime_cols.append(col)
            col_dict["category"] = "datetime"
            col_dict["dtype"] = str(series.dtype)

        else:
            categorical_cols.append(col)
            col_dict["category"] = "categorical"
            col_dict["dtype"] = "string"

        columns_profile[col] = col_dict

    preview = df.head(5).fillna("").to_dict(orient="records")

    return {
        "dataset_id": dataset_id,
        "id": dataset_id,
        "filename": filename,
        "file_path": file_path,
        "row_count": total_rows,
        "column_count": total_cols,
        "duplicate_rows": duplicate_rows,
        "preview": preview,
        "columns": [{"name": c} for c in df.columns],
        "profile": {
            "overview": {
                "row_count": total_rows,
                "column_count": total_cols,
                "duplicate_rows": duplicate_rows,
                "numeric_columns": numeric_cols,
                "categorical_columns": categorical_cols,
                "datetime_columns": datetime_cols,
            },
            "columns": columns_profile,
        },
    }


@router.get("/")
async def list_datasets() -> Dict[str, Any]:
    meta = _load_metadata()
    datasets = []
    for d_id, data in meta.items():
        datasets.append({
            "id": d_id,
            "dataset_id": d_id,
            "filename": data.get("filename"),
            "row_count": data.get("row_count"),
            "column_count": data.get("column_count"),
            "file_size_bytes": data.get("file_size_bytes", 0),
        })
    return {"datasets": datasets}


@router.get("/{dataset_id}/profile")
async def get_dataset_profile(dataset_id: str) -> Dict[str, Any]:
    meta = _load_metadata()
    if dataset_id not in meta:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return meta[dataset_id]


@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Empty filename provided.")

    dataset_id = str(uuid.uuid4())[:8]
    ext = os.path.splitext(file.filename)[-1].lower()
    save_filename = f"{dataset_id}_{file.filename}"
    save_path = os.path.join(BASE_STORAGE_DIR, save_filename)

    try:
        # Read file into memory first to avoid file lock conflicts
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        with open(save_path, "wb") as f:
            f.write(content)

        file_size = len(content)

        # Parse DataFrame
        if ext == ".csv":
            try:
                df = pd.read_csv(io.BytesIO(content), encoding="utf-8")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), encoding="latin1")
        elif ext in [".xlsx", ".xls"]:
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}. Upload CSV or Excel.")

        # Compute dynamic statistical profile
        profile = generate_profile(df, file.filename, dataset_id, save_path)
        profile["file_size_bytes"] = file_size

        # Persist to metadata
        meta = _load_metadata()
        meta[dataset_id] = profile
        _save_metadata(meta)

        print(f"[Upload Success] Saved {file.filename} as {dataset_id} with {len(df)} rows.")
        return profile

    except HTTPException:
        if os.path.exists(save_path):
            try:
                os.remove(save_path)
            except Exception:
                pass
        raise
    except Exception as e:
        if os.path.exists(save_path):
            try:
                os.remove(save_path)
            except Exception:
                pass
        print(f"[Upload Fatal Error]: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Data processing failed: {str(e)}")