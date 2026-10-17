# ✦ DataPilot: Autonomous Agentic AI Data Analyst

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![DuckDB](https://img.shields.io/badge/DuckDB-OLAP_Engine-FFF000.svg?logo=duckdb&logoColor=black)](https://duckdb.org)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Gemini](https://img.shields.io/badge/LLM-Google_Gemini-4285F4.svg?logo=google&logoColor=white)](https://ai.google.dev)
[![Recharts](https://img.shields.io/badge/Recharts-2.12+-22c55e.svg)](https://recharts.org)

**DataPilot** is a production-grade autonomous AI data analyst that bridges natural language questions with a high-performance in-memory columnar OLAP database (**DuckDB**). It completely eliminates numerical hallucinations by ensuring every calculation is deterministically computed in SQL before being synthesized into natural language insights and dynamic visualizations.

---

## 🎯 Main Purpose of the Project

Traditional LLMs struggle with quantitative analytics: when asked arithmetic, aggregations, or segmentation questions over thousands of rows, they frequently "hallucinate" plausible-sounding but mathematically incorrect values. 

**The Core Mission of DataPilot:**
1. **Zero Hallucination:** Outsource 100% of arithmetic, sums, percentages, and cohort slicing to a deterministic SQL engine (DuckDB).
2. **Autonomous Analytics:** Provide automated data profiling, schema introspection, and prompt recommendations the moment a dataset is uploaded.
3. **Executive-Ready Presentation:** Automatically transform raw table queries into a clean 3-tier presentation:
   - **Executive Insight:** 1–2 sentence direct business takeaway.
   - **Dynamic Visualizations:** Interactive Bar, Line, Area, or Pie charts with automated currency and unit scaling ($K, $M, $B).
   - **Data Summary Tables:** Formatted markdown tables with ground-truth records.
   - **SQL Audit Drawer:** Full transparency into the exact SQL query executed.

---

## ⚙️ How It Works (The 3-Tier Pipeline)

```
       User Prompt: "Compare churn balance lost across France, Germany, and Spain"
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ 1. SQL Formulation (Google Gemini)               │
             │    - Reads live schema and conversation context  │
             │    - Generates read-only DuckDB SQL query        │
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ 2. Deterministic Execution (DuckDB OLAP)         │
             │    - Executes query directly over full dataset   │
             │    - Computes exact mathematical ground truth    │
             │    - Germany: $97.97M | France: $57.67M ...      │
             └────────────────────────┬─────────────────────────┘
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │ 3. Insight & Visualization Synthesis             │
             │    - Formulates Executive Verdict                │
             │    - Generates Recharts JSON configuration       │
             │    - Builds markdown summary table               │
             │    - Stores query in collapsible SQL drawer      │
             └──────────────────────────────────────────────────┘
```

1. **Upload & Auto-Profiling:** When you upload a CSV, Excel, or tabular file, the backend calculates cardinality, null percentages, distribution statistics (mean, min, max), and auto-generates context-specific suggestion chips.
2. **Intent Translation:** The LLM translates user queries into sanitized, read-only DuckDB SQL statements.
3. **In-Memory OLAP Execution:** DuckDB runs the vectorized query against the dataset view in sub-second response times.
4. **Structured Delivery:** The frontend parses the response into interactive charts, KPI cards, tables, and audit logs.

---

## ✨ Key Features

- **⚡ Sub-Second Columnar OLAP:** Instant analytical queries on datasets with 10,000+ rows using embedded DuckDB.
- **📊 Adaptive Chart Dispatcher:** Auto-renders Recharts components (Bar, Line, Area, Pie) and falls back to scalar KPI cards when inspecting single metrics.
- **🛡️ Read-Only Query Hardening:** Built-in SQL sanitizer blocks destructive statements (`DROP`, `DELETE`, `INSERT`, `ALTER`) and prevents filesystem escapes.
- **🔍 Auto Schema Introspection:** Generates customized question chips based on column names, data types, and unique values.
- **📥 One-Click Export:** Download clean Markdown (`.md`) reports summarizing all findings, tables, and executed queries.

---

## 🛠️ Tech Stack

- **Backend:** Python 3.10+, FastAPI, DuckDB, Pydantic, Uvicorn
- **LLM Engine:** Google Gemini API (`gemini-1.5-flash` / `gemini-pro`)
- **Frontend:** React 18, Vite, Tailwind CSS, Recharts, Axios, Lucide Icons

---

## 📂 Project Structure

```text
datapilot/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analysis.py        # Dataset profiling and export routes
│   │   │   ├── datasets.py        # Upload, metadata, and schema endpoints
│   │   │   └── llm.py             # Agent reasoning, SQL synthesis & briefing
│   │   ├── services/
│   │   │   └── llm_service.py     # Gemini client connection handler
│   │   └── tools/
│   │       └── sql_analysis.py    # DuckDB query engine & security sandbox
│   ├── storage/                   # Local dataset cache and metadata
│   ├── requirements.txt           # Python dependencies
│   └── main.py                    # FastAPI server entry point
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   └── DynamicChart.jsx   # Multi-chart Recharts visualization wrapper
    │   ├── App.jsx                # Main analytical workspace and dashboard
    │   └── main.jsx               # React entry point
    ├── package.json
    ├── tailwind.config.js
    └── vite.config.js
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python:** 3.10 or higher
- **Node.js:** 18 or higher
- **Gemini API Key:** Obtain from [Google AI Studio](https://aistudio.google.com/)

---

### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows (PowerShell):
venv\Scripts\Activate.ps1
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set your Gemini API Key
# On Windows (PowerShell):
$env:GEMINI_API_KEY="your-gemini-api-key"
# On macOS/Linux:
export GEMINI_API_KEY="your-gemini-api-key"

# Launch backend server
uvicorn main:app --reload --port 8000
```
Backend will be live at `http://localhost:8000/docs`.

---

### 3. Frontend Setup

```bash
# Open a new terminal and navigate to frontend
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
Frontend will be live at `http://localhost:5173`.

---

## 🧪 Validated Benchmarks

DataPilot has been tested and verified across multiple domains:

| Dataset | Records | Features | Highlight Verification Query |
| :--- | :---: | :---: | :--- |
| **Admission Predict** | 400 | 9 | Low GRE (<310) vs. High Admit Chance ($\ge 0.70$) segment isolation. |
| **Churn Modelling** | 10,000 | 14 | Total balance lost ($97.97M German loss) & 100% 4-product customer churn anomaly. |
| **Titanic Survival** | 714 | 8 | Multi-variable survival cross-tabulation by Class and Sex. |

---

## 🔒 Security & Query Sandboxing

To guarantee safety when running on production systems:
- All queries run against ephemeral in-memory sessions with `SET enable_external_access=false;`.
- A regex-based safety analyzer strictly rejects any statements containing `DROP`, `DELETE`, `INSERT`, `UPDATE`, `ALTER`, or file-write calls. Only read-only `SELECT` queries are permitted.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).