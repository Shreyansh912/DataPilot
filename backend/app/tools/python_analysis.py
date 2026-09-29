import ast
import io
import sys
from typing import Any, Dict
import numpy as np
import pandas as pd

BLOCKED_MODULES = {
    "os", "sys", "subprocess", "socket", "urllib", "requests",
    "shutil", "builtins", "importlib", "pathlib", "fcntl", "pty"
}

BLOCKED_ATTRIBUTES = {
    "__subclasses__", "__globals__", "__builtins__", "__import__",
    "__class__", "__base__", "__code__", "__reduce__"
}


class SecurityValidator(ast.NodeVisitor):
    """Inspects the Python AST to reject unauthorized imports and malicious attribute access."""

    def visit_Import(self, node):
        for alias in node.names:
            if alias.name.split(".")[0] in BLOCKED_MODULES:
                raise SecurityError(f"Import of module '{alias.name}' is strictly blocked.")
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module and node.module.split(".")[0] in BLOCKED_MODULES:
            raise SecurityError(f"Import from module '{node.module}' is strictly blocked.")
        self.generic_visit(node)

    def visit_Attribute(self, node):
        if node.attr in BLOCKED_ATTRIBUTES:
            raise SecurityError(f"Access to protected attribute '{node.attr}' is denied.")
        self.generic_visit(node)


class SecurityError(Exception):
    pass


def run_sandboxed_python(df: pd.DataFrame, code: str) -> Dict[str, Any]:
    """Executes user/agent-generated Python analysis code within an isolated scope."""
    # 1. AST Static Inspection
    try:
        parsed_ast = ast.parse(code)
        validator = SecurityValidator()
        validator.visit(parsed_ast)
    except SecurityError as sec_err:
        return {"success": False, "error": f"Security Violation: {str(sec_err)}", "data": None}
    except SyntaxError as syn_err:
        return {"success": False, "error": f"Syntax Error: {str(syn_err)}", "data": None}

    # 2. Prepare Sandbox Scope
    # Work on a copy so transformations don't alter original state unless intended
    local_scope = {
        "df": df.copy(),
        "pd": pd,
        "np": np,
        "result": None,
    }
    
    # Safe built-in whitelist
    safe_builtins = {
        "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
        "enumerate": enumerate, "float": float, "int": int, "len": len,
        "list": list, "max": max, "min": min, "range": range, "round": round,
        "set": set, "str": str, "sum": sum, "tuple": tuple, "zip": zip,
        "print": lambda *args: None  # capture or mute print
    }
    restricted_globals = {"__builtins__": safe_builtins}

    # 3. Execution
    try:
        compiled_code = compile(parsed_ast, filename="<agent_sandbox>", mode="exec")
        exec(compiled_code, restricted_globals, local_scope)

        raw_result = local_scope.get("result")

        # Normalize the result object to serializable JSON
        if isinstance(raw_result, pd.DataFrame):
            data = raw_result.head(500).fillna("").to_dict(orient="records")
            row_count = len(raw_result)
        elif isinstance(raw_result, pd.Series):
            data = raw_result.head(500).fillna("").to_dict()
            row_count = len(raw_result)
        elif isinstance(raw_result, (np.integer, int)):
            data = int(raw_result)
            row_count = 1
        elif isinstance(raw_result, (np.floating, float)):
            data = float(raw_result)
            row_count = 1
        elif isinstance(raw_result, (dict, list, str, bool)):
            data = raw_result
            row_count = len(raw_result) if isinstance(raw_result, (dict, list)) else 1
        elif raw_result is None:
            # If code didn't assign to `result`, check if `df` was modified
            data = local_scope["df"].head(100).fillna("").to_dict(orient="records")
            row_count = len(local_scope["df"])
        else:
            data = str(raw_result)
            row_count = 1

        return {
            "success": True,
            "data": data,
            "row_count": row_count,
            "error": None
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Execution Error: {str(e)}",
            "data": None,
            "row_count": 0
        }