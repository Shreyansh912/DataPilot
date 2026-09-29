from typing import Any, Dict, List
import numpy as np
import pandas as pd


class DatasetProfiler:
    """Performs deep statistical profiling and data quality audits on DataFrames."""

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.total_rows = len(df)
        self.total_cols = len(df.columns)

    def run_full_profile(self) -> Dict[str, Any]:
        """Runs the complete profiling pipeline and returns a structured dictionary."""
        if self.total_rows == 0:
            return {"error": "Dataset is empty"}

        column_profiles = {}
        data_quality_issues: List[str] = []

        # Check duplicate rows
        duplicate_count = int(self.df.duplicated().sum())
        if duplicate_count > 0:
            pct = round((duplicate_count / self.total_rows) * 100, 2)
            data_quality_issues.append(
                f"Found {duplicate_count} duplicate rows ({pct}% of total records)."
            )

        numerical_cols: List[str] = []
        categorical_cols: List[str] = []
        datetime_cols: List[str] = []

        for col in self.df.columns:
            series = self.df[col]
            missing_count = int(series.isnull().sum())
            missing_pct = round((missing_count / self.total_rows) * 100, 2)

            if missing_pct > 30.0:
                data_quality_issues.append(
                    f"Column '{col}' has high missingness ({missing_pct}% missing)."
                )

            unique_count = int(series.nunique(dropna=True))
            if unique_count == 1:
                data_quality_issues.append(
                    f"Column '{col}' has constant value across all rows (zero variance)."
                )

            # Determine column category and stats
            col_info: Dict[str, Any] = {
                "dtype": str(series.dtype),
                "missing_count": missing_count,
                "missing_pct": missing_pct,
                "unique_count": unique_count,
            }

            if pd.api.types.is_numeric_dtype(series):
                numerical_cols.append(col)
                col_info["type_category"] = "numerical"
                clean_series = series.dropna()

                if not clean_series.empty:
                    col_info["stats"] = {
                        "min": float(clean_series.min()),
                        "max": float(clean_series.max()),
                        "mean": round(float(clean_series.mean()), 4),
                        "median": round(float(clean_series.median()), 4),
                        "std": round(float(clean_series.std()), 4)
                        if len(clean_series) > 1
                        else 0.0,
                        "q25": round(float(clean_series.quantile(0.25)), 4),
                        "q75": round(float(clean_series.quantile(0.75)), 4),
                    }
                else:
                    col_info["stats"] = {}

            elif (
                pd.api.types.is_datetime64_any_dtype(series)
                or self._detect_datetime(series)
            ):
                datetime_cols.append(col)
                col_info["type_category"] = "datetime"
                # Attempt to parse date ranges
                try:
                    dt_series = pd.to_datetime(series.dropna(), errors="coerce")
                    col_info["stats"] = {
                        "earliest": str(dt_series.min()),
                        "latest": str(dt_series.max()),
                    }
                except Exception:
                    col_info["stats"] = {}
            else:
                categorical_cols.append(col)
                col_info["type_category"] = "categorical"
                top_values = (
                    series.value_counts(dropna=True).head(5).to_dict()
                )
                col_info["stats"] = {
                    "top_frequencies": {
                        str(k): int(v) for k, v in top_values.items()
                    }
                }

            column_profiles[col] = col_info

        return {
            "overview": {
                "total_rows": self.total_rows,
                "total_columns": self.total_cols,
                "duplicate_rows": duplicate_count,
                "duplicate_pct": round(
                    (duplicate_count / self.total_rows) * 100, 2
                ),
                "numerical_columns": numerical_cols,
                "categorical_columns": categorical_cols,
                "datetime_columns": datetime_cols,
            },
            "columns": column_profiles,
            "data_quality_warnings": data_quality_issues,
        }

    def _detect_datetime(self, series: pd.Series) -> bool:
        """Heuristic to catch date string columns."""
        if not pd.api.types.is_string_dtype(series) and not pd.api.types.is_object_dtype(series):
            return False
        sample = series.dropna().head(10)
        if sample.empty:
            return False
        try:
            converted = pd.to_datetime(sample, errors="coerce", format="mixed")
            return converted.notnull().mean() > 0.8
        except Exception:
            return False