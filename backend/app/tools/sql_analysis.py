import os
import re
from typing import Dict, Any
import pandas as pd

try:
    import duckdb
    HAS_DUCKDB = True
except ImportError:
    HAS_DUCKDB = False


class DuckDBQueryEngine:
    """Executes sandboxed read-only SQL queries directly against datasets."""

    @staticmethod
    def execute_sql(file_path: str, sql_query: str) -> Dict[str, Any]:
        if not os.path.exists(file_path):
            return {"success": False, "error": f"Source file not found at: {file_path}"}

        # Clean query: strip fences, semicolons, extra spaces
        clean_query = sql_query.strip()
        clean_query = re.sub(r"^```(?:sql)?\s*", "", clean_query, flags=re.IGNORECASE)
        clean_query = re.sub(r"\s*```$", "", clean_query)
        clean_query = clean_query.strip().rstrip(";")

        # Security check: Read-only statements
        forbidden = ["drop ", "delete ", "insert ", "update ", "alter ", "create table", "truncate "]
        if any(f in clean_query.lower() for f in forbidden):
            return {"success": False, "error": "Unauthorized: Only read-only SELECT queries are permitted."}

        try:
            if HAS_DUCKDB:
                con = duckdb.connect(database=":memory:", read_only=False)
                clean_path = file_path.replace("\\", "/")
                ext = os.path.splitext(file_path)[-1].lower()

                if ext == ".csv":
                    con.execute(f"CREATE VIEW dataset AS SELECT * FROM read_csv_auto('{clean_path}', header=True, ignore_errors=True)")
                elif ext in [".parquet", ".pq"]:
                    con.execute(f"CREATE VIEW dataset AS SELECT * FROM read_parquet('{clean_path}')")
                else:
                    df = pd.read_excel(file_path) if ext in [".xlsx", ".xls"] else pd.read_csv(file_path)
                    df.columns = [c.strip() for c in df.columns]
                    con.register("dataset", df)

                result_df = con.execute(clean_query).fetchdf()
                con.close()
            else:
                # In-memory SQLite/Pandas fallback if duckdb binary is missing
                import sqlite3
                df = pd.read_csv(file_path)
                df.columns = [c.strip() for c in df.columns]
                sqlite_conn = sqlite3.connect(":memory:")
                df.to_sql("dataset", sqlite_conn, index=False, if_exists="replace")
                result_df = pd.read_sql_query(clean_query, sqlite_conn)
                sqlite_conn.close()

            # Clean and round float fields
            for col in result_df.select_dtypes(include=["float64", "float32"]).columns:
                result_df[col] = result_df[col].round(2)

            records = result_df.to_dict(orient="records")
            return {
                "success": True,
                "columns": list(result_df.columns),
                "row_count": len(records),
                "data": records[:200]
            }

        except Exception as e:
            return {"success": False, "error": str(e)}