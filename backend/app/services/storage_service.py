import os
import re
import uuid
from pathlib import Path
from app.config import settings

ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".pdf"]
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50MB

BASE_DIR = Path(__file__).resolve().parent.parent.parent
LOCAL_UPLOAD_DIR = BASE_DIR / "data" / "uploads"
LOCAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename(filename: str) -> str:
    cleaned = re.sub(r"[^\w\.-]", "_", filename)
    return cleaned[:100]


def upload_file_to_storage(content: bytes, filename: str) -> str:
    unique_prefix = uuid.uuid4().hex[:8]
    clean_name = sanitize_filename(filename)
    storage_filename = f"{unique_prefix}_{clean_name}"

    # 1. Try Supabase Storage
    try:
        from app.database.connection import get_supabase_admin_client
        supabase = get_supabase_admin_client()
        supabase.storage.from_("datasets").upload(
            path=storage_filename,
            file=content,
            file_options={"content-type": "application/octet-stream"},
        )
        return storage_filename
    except Exception as e:
        print(f"Supabase storage upload skipped ({e}). Using local fallback.")
        
        # 2. Local disk fallback
        local_file_path = LOCAL_UPLOAD_DIR / storage_filename
        with open(local_file_path, "wb") as f:
            f.write(content)
        
        # Store as standard forward-slash relative path
        return f"local://{storage_filename}"


def download_file_from_storage(storage_path: str) -> bytes:
    # 1. Check if stored locally
    if storage_path.startswith("local://"):
        filename = storage_path.replace("local://", "")
        local_file = LOCAL_UPLOAD_DIR / filename
        if local_file.exists():
            with open(local_file, "rb") as f:
                return f.read()

    local_check = Path(storage_path)
    if local_check.exists() and local_check.is_file():
        with open(local_check, "rb") as f:
            return f.read()

    # 2. Supabase Storage download
    from app.database.connection import get_supabase_admin_client
    supabase = get_supabase_admin_client()
    return supabase.storage.from_("datasets").download(storage_path)