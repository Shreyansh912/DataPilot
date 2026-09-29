import io
import pandas as pd
from typing import Tuple


def parse_file_to_dataframe(content: bytes, filename: str) -> Tuple[pd.DataFrame, str]:
    """Parses raw uploaded file bytes (CSV, Excel, or PDF) into a Pandas DataFrame."""
    lower_name = filename.lower()

    if lower_name.endswith(".csv"):
        # Detect encoding and parse CSV
        try:
            df = pd.read_csv(io.BytesIO(content))
        except UnicodeDecodeError:
            df = pd.read_csv(io.BytesIO(content), encoding="latin1")
        return df, "csv"

    elif lower_name.endswith((".xlsx", ".xls")):
        # Read Excel workbook
        df = pd.read_excel(io.BytesIO(content))
        return df, "excel"

    elif lower_name.endswith(".pdf"):
        # Try tabula or pdfplumber if installed, fallback to empty/text
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(content)) as pdf:
                all_rows = []
                for page in pdf.pages:
                    table = page.extract_table()
                    if table:
                        all_rows.extend(table)
                if all_rows:
                    headers = all_rows[0]
                    df = pd.DataFrame(all_rows[1:], columns=headers)
                    return df, "pdf"
        except Exception:
            pass

        raise ValueError("Could not extract structured table from the provided PDF file.")

    else:
        raise ValueError(f"Unsupported file format: {filename}")