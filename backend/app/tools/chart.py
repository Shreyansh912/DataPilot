from typing import Any, Dict, List, Optional


def create_chart_spec(
    data: List[Dict[str, Any]],
    x_axis: str,
    y_axis: List[str],
    chart_type: str = "bar",
    title: Optional[str] = None
) -> Dict[str, Any]:
    """Builds a structured visualization specification strictly verified against computed records."""
    if not data:
        return {
            "success": False,
            "error": "Cannot generate chart from empty dataset records."
        }

    valid_types = {"bar", "line", "scatter", "area"}
    selected_type = chart_type.lower() if chart_type.lower() in valid_types else "bar"

    # Verify that specified columns actually exist in the records
    first_record = data[0]
    if x_axis not in first_record:
        return {
            "success": False,
            "error": f"X-axis column '{x_axis}' was not found in analytical results."
        }

    verified_y = [col for col in y_axis if col in first_record]
    if not verified_y:
        return {
            "success": False,
            "error": f"None of the requested Y-axis columns {y_axis} exist in the analytical results."
        }

    return {
        "success": True,
        "chart_spec": {
            "type": selected_type,
            "title": title or f"{', '.join(verified_y)} by {x_axis}",
            "x_axis": x_axis,
            "y_axis": verified_y,
            "data": data[:200]  # Cap points for smooth frontend rendering
        }
    }