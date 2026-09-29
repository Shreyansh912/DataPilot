import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import DynamicChart from "./components/DynamicChart";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

function FormattedAnalysis({ content }) {
  if (!content) return null;

  let textContent = content;
  let chartConfig = null;
  let extractedSql = null;

  // 1. Extract SQL block for the collapsible drawer
  const sqlMatch = textContent.match(/```(?:sql)\s*([\s\S]*?)\s*```/i);
  if (sqlMatch) {
    extractedSql = sqlMatch[1].trim();
    textContent = textContent.replace(sqlMatch[0], "").trim();
  }

  // 2. Extract embedded chart configuration
  const chartPatterns = [
    /`{2,3}(?:chart|json)?\s*(\{[\s\S]*?"(?:type|chart|config|data)"[\s\S]*?\})\s*`{2,3}/i,
    /```chart\s*([\s\S]*?)\s*```/i,
  ];

  for (const regex of chartPatterns) {
    const match = textContent.match(regex);
    if (match) {
      try {
        let parsed = JSON.parse(match[1]);
        if (!parsed.data && parsed.chart && parsed.chart.data) parsed = parsed.chart;
        if (!parsed.data && parsed.config && parsed.config.data) parsed = parsed.config;

        if (parsed && parsed.data && Array.isArray(parsed.data) && parsed.data.length >= 2) {
          chartConfig = parsed;
        }
      } catch (e) {
        console.warn("Chart JSON parse warning:", e);
      }
      textContent = textContent.replace(match[0], "").trim();
      break;
    }
  }

  // 3. Process markdown text and data tables
  const lines = String(textContent).split("\n");
  const processedElements = [];
  let tableBuffer = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    const headerRow = tableBuffer[0];
    const dataRows = tableBuffer.slice(1);

    // If single data row, render as a KPI metric card
    if (dataRows.length === 1 && dataRows[0].length >= 2) {
      const row = dataRows[0];
      processedElements.push(
        <div key={`kpi-${processedElements.length}`} className="my-3 flex flex-wrap gap-3">
          {headerRow.map((colName, cIdx) => (
            <div
              key={cIdx}
              className="flex-1 min-w-[130px] p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm"
            >
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block font-mono">
                {colName}
              </span>
              <span className="text-lg font-bold text-indigo-300 font-mono mt-0.5 block">
                {row[cIdx] || "-"}
              </span>
            </div>
          ))}
        </div>
      );
    } else {
      // Standard markdown table
      processedElements.push(
        <div
          key={`table-${processedElements.length}`}
          className="my-3 overflow-x-auto rounded-xl border border-slate-800/90 shadow-sm"
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                {headerRow.map((cell, i) => (
                  <th key={i} className="py-2.5 px-3.5 font-medium">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {dataRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-800/40 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="py-2.5 px-3.5 text-slate-200">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    tableBuffer = [];
  };

  lines.forEach((line, idx) => {
    let trimmed = line.trim();

    // Clean literal template headings
    trimmed = trimmed.replace(
      /^[1-4]\.\s*(EXECUTIVE INSIGHT|INTERACTIVE CHART BLOCK|DATA SUMMARY TABLE|SQL AUDIT):\s*/i,
      ""
    ).trim();

    if (!trimmed) {
      flushTable();
      processedElements.push(<div key={idx} className="h-1" />);
      return;
    }

    // Capture markdown table rows
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (!trimmed.includes("---")) {
        const cells = trimmed
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        tableBuffer.push(cells);
      }
      return;
    }

    flushTable();

    // Headers
    if (trimmed.startsWith("### ") || trimmed.startsWith("## ")) {
      processedElements.push(
        <h4
          key={idx}
          className="text-xs font-bold text-indigo-300 uppercase tracking-wider mt-3 mb-1"
        >
          {trimmed.replace(/^#+\s*/, "")}
        </h4>
      );
      return;
    }

    // Executive Callouts
    if (
      trimmed.toLowerCase().startsWith("executive insight") ||
      trimmed.toLowerCase().startsWith("executive verdict") ||
      trimmed.toLowerCase().startsWith("verdict:")
    ) {
      processedElements.push(
        <div
          key={idx}
          className="p-3.5 rounded-xl bg-indigo-950/60 border border-indigo-500/40 text-indigo-200 font-medium text-xs leading-relaxed my-2 shadow-inner"
        >
          {trimmed}
        </div>
      );
      return;
    }

    // Bullet points
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      const bulletText = trimmed.replace(/^[\*\-•]\s+/, "");
      processedElements.push(
        <div key={idx} className="flex items-start gap-2.5 ml-1 my-1">
          <span className="text-indigo-400 mt-1 text-xs shrink-0">◆</span>
          <span className="text-xs text-slate-200">{bulletText}</span>
        </div>
      );
      return;
    }

    // Standard body text
    processedElements.push(
      <p key={idx} className="text-xs text-slate-300 leading-normal">
        {trimmed}
      </p>
    );
  });

  flushTable();

  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-200">
      {chartConfig && <DynamicChart chartConfig={chartConfig} />}
      {processedElements}
      {extractedSql && (
        <details className="mt-3 group rounded-xl bg-slate-900/60 border border-slate-800 text-xs transition-all">
          <summary className="cursor-pointer select-none px-3.5 py-2.5 font-mono text-[11px] text-slate-400 hover:text-indigo-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>⚡</span>
              <span className="font-semibold">View Generated SQL Query</span>
            </span>
            <span className="text-slate-500 text-[10px] group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>
          <div className="p-3.5 pt-1 border-t border-slate-800/80">
            <pre className="p-3 rounded-lg bg-[#070b14] border border-slate-800 font-mono text-[11px] text-indigo-300 overflow-x-auto">
              <code>{extractedSql}</code>
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}

export default function App() {
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [queryPrompt, setQueryPrompt] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);
  const [chatLog, setChatLog] = useState([]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchDatasets();
  }, []);

  const fetchDatasets = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/datasets/`);
      const list = res.data?.datasets || [];
      setDatasets(list);
      if (list.length > 0 && !selectedDataset) {
        loadDatasetProfile(list[0].id);
      }
    } catch (err) {
      console.error("Failed to load datasets:", err);
    }
  };

  const loadDatasetProfile = async (datasetId) => {
    try {
      setErrorMsg("");
      const res = await axios.get(`${API_BASE_URL}/datasets/${datasetId}/profile`);
      setSelectedDataset(res.data);
    } catch (err) {
      console.error("Failed to load dataset profile:", err);
      setErrorMsg(err.response?.data?.detail || "Could not retrieve dataset details.");
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFileToUpload(e.target.files[0]);
      setErrorMsg("");
    }
  };

  const handleUpload = async () => {
    if (!fileToUpload) return;
    setUploading(true);
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", fileToUpload);

    try {
      const res = await axios.post(`${API_BASE_URL}/datasets/upload`, formData);
      setSelectedDataset(res.data);
      setFileToUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchDatasets();
    } catch (err) {
      console.error("Upload error details:", err);
      if (err.response) {
        const detail =
          err.response.data?.detail ||
          err.response.data ||
          `Server returned status ${err.response.status}`;
        setErrorMsg(typeof detail === "object" ? JSON.stringify(detail) : String(detail));
      } else if (err.request) {
        setErrorMsg(`Cannot connect to backend at ${API_BASE_URL}. Ensure Uvicorn is active.`);
      } else {
        setErrorMsg(err.message || "An unexpected error occurred.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleAskAgent = async (e, customPrompt = null) => {
    if (e) e.preventDefault();
    const promptToSend = customPrompt || queryPrompt;
    if (!promptToSend.trim() || queryLoading) return;

    setChatLog((prev) => [...prev, { sender: "user", text: promptToSend }]);
    setQueryPrompt("");
    setQueryLoading(true);

    try {
      let dataContext = "";
      const activeDatasetId = selectedDataset?.dataset_id || selectedDataset?.id;

      if (selectedDataset) {
        const columns =
          selectedDataset.columns?.map((c) => c.name).join(", ") ||
          Object.keys(selectedDataset.profile?.columns || {}).join(", ");
        const preview = selectedDataset.preview ? JSON.stringify(selectedDataset.preview) : "[]";
        const rows =
          selectedDataset.row_count ||
          selectedDataset.profile?.overview?.row_count ||
          "unknown";

        dataContext = `You are DataPilot, an expert autonomous data analyst.
Dataset Name: ${selectedDataset.filename}
Total Rows: ${rows}
Columns: [${columns}]
Sample Records (JSON):
${preview}

Answer the following user question directly, accurately, and systematically:
`;
      }

      const res = await axios.post(`${API_BASE_URL}/llm/generate`, {
        prompt: `${dataContext}${promptToSend}`,
        dataset_id: activeDatasetId || null,
        user_query: promptToSend,
      });

      let rawText = "";
      if (typeof res.data === "string") {
        rawText = res.data;
      } else if (res.data?.output && typeof res.data.output === "string") {
        rawText = res.data.output;
      } else if (res.data?.response && typeof res.data.response === "string") {
        rawText = res.data.response;
      } else if (res.data?.content && typeof res.data.content === "string") {
        rawText = res.data.content;
      } else {
        rawText = JSON.stringify(res.data, null, 2);
      }

      let cleanedText = rawText.trim();
      const markers = [
        "**Selected Response:**",
        "**Response:**",
        "Selected Response:",
        "Final Response:",
        "**Final Response:**",
      ];
      for (const marker of markers) {
        if (cleanedText.includes(marker)) {
          cleanedText = cleanedText.split(marker).pop().replace(/^[\s":*]+/, "").trim();
        }
      }

      setChatLog((prev) => [...prev, { sender: "agent", text: cleanedText || rawText }]);
    } catch (err) {
      const errorText =
        err.response?.data?.detail || err.message || "Failed to communicate with LLM.";
      setChatLog((prev) => [
        ...prev,
        {
          sender: "agent",
          text: `Error: ${typeof errorText === "object" ? JSON.stringify(errorText) : errorText}`,
        },
      ]);
    } finally {
      setQueryLoading(false);
    }
  };

  // Export full analysis session to Markdown file
  const handleExportReport = () => {
    if (chatLog.length === 0) return;
    let reportContent = `# DataPilot Analysis Report\n`;
    reportContent += `**Dataset:** ${selectedDataset?.filename || "Ad-hoc Dataset"}\n`;
    reportContent += `**Generated:** ${new Date().toLocaleString()}\n\n---\n\n`;

    chatLog.forEach((msg, idx) => {
      if (msg.sender === "user") {
        reportContent += `### Query ${Math.floor(idx / 2) + 1}: ${msg.text}\n\n`;
      } else {
        reportContent += `${msg.text}\n\n---\n\n`;
      }
    });

    const blob = new Blob([reportContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DataPilot_Report_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Generate dynamic contextual chips based on available columns
  const getContextualChips = () => {
    if (!selectedDataset) return [];
    const cols =
      selectedDataset.columns?.map((c) => c.name.toLowerCase()) || [];

    const chips = [];
    if (cols.some((c) => c.includes("cgpa")) && cols.some((c) => c.includes("rating"))) {
      chips.push("Plot a bar chart comparing average CGPA across University Ratings (1 to 5).");
    }
    if (cols.some((c) => c.includes("sop")) && cols.some((c) => c.includes("chance"))) {
      chips.push("Plot a bar chart showing average Chance of Admit for each SOP rating (1.0 to 5.0).");
    }
    if (cols.some((c) => c.includes("research"))) {
      chips.push("Show me a pie chart illustrating the count of applicants with research experience versus without.");
    }
    if (cols.some((c) => c.includes("gre")) && cols.some((c) => c.includes("chance"))) {
      chips.push("How many applicants have a GRE Score below 310 but still have a Chance of Admit >= 0.70? What is their average CGPA?");
    }

    // Generic fallback chips
    if (chips.length === 0) {
      chips.push("What are the total row count and top summary statistics?");
      chips.push("Plot a breakdown of the primary numeric column.");
    }
    return chips;
  };

  const profile = selectedDataset?.profile || {};
  const overview = profile.overview || {};
  const columnsProfile = profile.columns || {};
  const previewRows = selectedDataset?.preview || [];
  const hygieneNotes = [];

  Object.entries(columnsProfile).forEach(([colName, colData]) => {
    if (colData?.cardinality === 1) {
      hygieneNotes.push(`Column '${colName}' has constant value across all rows (zero variance).`);
    }
    if (colData?.missing_count > 0) {
      const pct = colData.missing_pct ?? colData.missing_percentage ?? 0;
      hygieneNotes.push(
        `Column '${colName}' contains ${colData.missing_count} missing values (${Number(pct).toFixed(0)}%).`
      );
    }
  });

  const rowCount =
    selectedDataset?.row_count ??
    overview.row_count ??
    overview.total_rows ??
    previewRows.length ??
    0;
  const colCount =
    selectedDataset?.column_count ??
    overview.column_count ??
    overview.total_columns ??
    Object.keys(columnsProfile).length ??
    0;

  return (
    <div className="min-h-screen w-full bg-[#0a0f1d] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="w-full border-b border-slate-800 bg-[#0d1424]/90 backdrop-blur-md px-8 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-xl shadow-inner">
            ✦
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-bold tracking-tight text-white">DataPilot</span>
              <span className="text-[11px] bg-indigo-950/80 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded-full font-mono font-medium">
                Phase 2
              </span>
            </div>
            <p className="text-xs text-slate-400 tracking-wide mt-0.5">
              Autonomous Agentic AI Data Analyst
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="font-medium">DuckDB OLAP · Ready</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-700/40 text-emerald-300 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            <span className="font-semibold">Agent Engine Live</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="w-full max-w-[1780px] mx-auto px-6 lg:px-10 py-8 flex flex-col lg:flex-row gap-8 flex-1">
        {/* Left Sidebar */}
        <aside className="w-full lg:w-[380px] shrink-0 flex flex-col gap-6">
          {/* File Upload Box */}
          <section className="bg-[#111827]/80 border border-slate-800/90 rounded-2xl p-6 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span>📁</span> Upload Source File
              </span>
              <span className="text-[11px] text-slate-500 font-mono">Max 50MB</span>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 transition-all rounded-xl p-8 flex flex-col items-center justify-center text-center bg-slate-900/50 hover:bg-slate-900/80 cursor-pointer group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="h-12 w-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 text-xl group-hover:scale-110 transition-transform">
                ☁
              </div>
              <p className="text-sm font-semibold text-slate-200 truncate max-w-full px-2">
                {fileToUpload ? fileToUpload.name : "Select or drag dataset here"}
              </p>
              <p className="text-xs text-slate-500 mt-1">Supports CSV, Excel (.xlsx/.xls), and PDF Tables</p>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs leading-relaxed">
                {errorMsg}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!fileToUpload || uploading}
              className={`w-full mt-4 py-3 px-4 rounded-xl font-semibold text-sm shadow-lg flex items-center justify-center gap-2 transition-all ${
                !fileToUpload || uploading
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 active:scale-[0.99]"
              }`}
            >
              {uploading ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                  <span>Processing & Profiling...</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Upload & Analyze</span>
                </>
              )}
            </button>
          </section>

          {/* Uploaded Datasets Archive */}
          <section className="bg-[#111827]/80 border border-slate-800/90 rounded-2xl p-6 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <span>🗄️</span> Uploaded Datasets
              </span>
              <span className="bg-slate-800 text-slate-300 text-xs px-2.5 py-0.5 rounded-full font-mono">
                {datasets.length}
              </span>
            </div>

            <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[380px] pr-1">
              {datasets.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  <p className="text-2xl mb-2">📄</p>
                  <p>No datasets found</p>
                  <p className="text-[11px] mt-0.5">Upload a CSV or Excel file to get started</p>
                </div>
              ) : (
                datasets.map((d) => {
                  const currentId = selectedDataset?.dataset_id || selectedDataset?.id;
                  const isActive = currentId === d.id;
                  return (
                    <div
                      key={d.id}
                      onClick={() => loadDatasetProfile(d.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isActive
                          ? "bg-indigo-950/40 border-indigo-500 text-white shadow-sm"
                          : "bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/50 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className={`text-lg ${isActive ? "text-indigo-400" : "text-slate-500"}`}>
                          📄
                        </span>
                        <div className="truncate">
                          <p className="text-sm font-medium truncate">{d.filename}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {d.row_count} rows • {d.column_count} cols
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">
                        {d.file_size_bytes ? `${Math.round(d.file_size_bytes / 1024)} KB` : ""}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </aside>

        {/* Right Section */}
        <section className="flex-1 flex flex-col gap-6 overflow-hidden">
          {selectedDataset ? (
            <>
              {/* Header Metric Tiles */}
              <div className="bg-[#111827]/80 border border-slate-800/90 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
                      {selectedDataset.filename}
                    </h1>
                    <span className="text-xs bg-emerald-950/80 text-emerald-400 border border-emerald-700/50 px-2.5 py-0.5 rounded-full font-medium">
                      ✓ Profiled
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    ID: {selectedDataset.dataset_id || selectedDataset.id}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="px-5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center min-w-[95px]">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
                      Rows
                    </span>
                    <span className="text-xl font-bold text-white font-mono">{rowCount}</span>
                  </div>
                  <div className="px-5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center min-w-[95px]">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
                      Columns
                    </span>
                    <span className="text-xl font-bold text-white font-mono">{colCount}</span>
                  </div>
                  <div className="px-5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center min-w-[95px]">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
                      Duplicates
                    </span>
                    <span className="text-xl font-bold text-white font-mono">
                      {overview.duplicate_rows ?? selectedDataset.duplicate_rows ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Hygiene Notes */}
              {hygieneNotes.length > 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200">
                  <div className="flex items-center gap-2 font-semibold text-amber-400 text-sm mb-2">
                    <span>⚠️</span>
                    <span>DATA HYGIENE OBSERVATIONS ({hygieneNotes.length})</span>
                  </div>
                  <ul className="list-disc list-inside text-xs space-y-1.5 pl-2 text-amber-200/90">
                    {hygieneNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Statistical Profile Table */}
              <div className="bg-[#111827]/80 border border-slate-800/90 rounded-2xl p-6 shadow-xl">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
                  <span>📊</span> Statistical Profile Breakdown
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase bg-slate-900/80">
                        <th className="py-3 px-4">Column</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Missing %</th>
                        <th className="py-3 px-4">Cardinality</th>
                        <th className="py-3 px-4 min-w-[320px]">Metrics Snapshot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                      {Object.entries(columnsProfile).map(([colName, info]) => {
                        let cat = "categorical";
                        if (
                          overview.datetime_columns?.includes(colName) ||
                          colName.toLowerCase().includes("date") ||
                          colName.toLowerCase().includes("time")
                        ) {
                          cat = "datetime";
                        } else if (
                          overview.numeric_columns?.includes(colName) ||
                          ["int64", "float64", "int32", "float32"].includes(info.dtype) ||
                          info.category === "numerical"
                        ) {
                          cat = "numerical";
                        } else {
                          cat = "categorical";
                        }

                        let badgeColor = "bg-indigo-950/80 text-indigo-300 border-indigo-800/50";
                        if (cat === "numerical") {
                          badgeColor = "bg-purple-950/80 text-purple-300 border-purple-800/50";
                        } else if (cat === "datetime") {
                          badgeColor = "bg-cyan-950/80 text-cyan-300 border-cyan-800/50";
                        }

                        const metrics = [];
                        if (info.mean !== undefined && info.mean !== null) {
                          metrics.push(`avg: ${Number(info.mean).toFixed(2)}`);
                        }
                        if (info.min !== undefined && info.min !== null) {
                          metrics.push(`min: ${info.min}`);
                        }
                        if (info.max !== undefined && info.max !== null) {
                          metrics.push(`max: ${info.max}`);
                        }

                        const cardinality =
                          info.cardinality ??
                          info.unique_count ??
                          info.distinct_count ??
                          (previewRows.length > 0
                            ? new Set(previewRows.map((r) => r[colName])).size
                            : "-");

                        const missingVal = info.missing_pct ?? info.missing_percentage ?? 0;
                        const missingPct = Number(missingVal).toFixed(0);

                        return (
                          <tr key={colName} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-4 font-semibold text-white">{colName}</td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2.5 py-0.5 rounded border text-[11px] font-sans ${badgeColor}`}
                              >
                                {cat}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">{missingPct}%</td>
                            <td className="py-3.5 px-4 text-slate-200">{cardinality}</td>
                            <td className="py-3.5 px-4 text-slate-300">
                              {metrics.join(" | ") || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Agentic Query Section */}
              <div className="bg-[#111827]/80 border border-slate-800/90 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                      💬
                    </div>
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                        Autonomous Data Insights & Visualizations
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Context-aware natural language reasoning and dynamic charts
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {chatLog.length > 0 && (
                      <button
                        onClick={handleExportReport}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <span>📥</span> Export Report
                      </button>
                    )}
                    <span className="text-[11px] bg-indigo-950/70 border border-indigo-800/50 text-indigo-300 px-3 py-1 rounded-full font-mono font-medium">
                      DuckDB + Gemini
                    </span>
                  </div>
                </div>

                {/* Conversation Box */}
                <div className="flex flex-col gap-4 min-h-[220px] max-h-[580px] overflow-y-auto p-4 rounded-xl bg-[#0b101d] border border-slate-800/80 shadow-inner">
                  {chatLog.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500 text-xs">
                      <span className="text-3xl mb-2">⚡</span>
                      <p className="font-medium text-slate-300 text-sm">
                        Ask any analytical question or request a chart
                      </p>
                      <p className="text-slate-500 mt-1 max-w-md">
                        Try these discovered questions for {selectedDataset.filename}:
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center mt-3 max-w-xl">
                        {getContextualChips().map((chip, cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() => handleAskAgent(null, chip)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500 text-[11px] text-slate-300 transition-colors"
                          >
                            "{chip}"
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    chatLog.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex flex-col max-w-[92%] rounded-2xl p-4.5 text-sm ${
                          msg.sender === "user"
                            ? "self-end bg-indigo-600/90 text-white shadow-md shadow-indigo-900/30"
                            : "self-start bg-[#12192b] border border-slate-800 text-slate-200 shadow-md"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-white/10">
                          <span className="text-base">{msg.sender === "user" ? "👤" : "✦"}</span>
                          <span className="text-[11px] uppercase font-bold tracking-wider opacity-80 font-mono">
                            {msg.sender === "user" ? "Analyst Inquiry" : "DataPilot Synthesis"}
                          </span>
                        </div>

                        {msg.sender === "user" ? (
                          <div className="text-sm font-medium">{msg.text}</div>
                        ) : (
                          <FormattedAnalysis content={msg.text} />
                        )}
                      </div>
                    ))
                  )}
                  {queryLoading && (
                    <div className="self-start bg-[#12192b] border border-slate-800 rounded-2xl p-4 text-xs text-indigo-300 flex items-center gap-3">
                      <span className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                      <span className="font-medium">
                        Querying DuckDB OLAP engine and synthesizing response...
                      </span>
                    </div>
                  )}
                </div>

                {/* Query Input Box */}
                <form onSubmit={(e) => handleAskAgent(e)} className="flex gap-3">
                  <input
                    type="text"
                    value={queryPrompt}
                    onChange={(e) => setQueryPrompt(e.target.value)}
                    placeholder={`Ask questions or request a chart for ${selectedDataset.filename}...`}
                    className="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!queryPrompt.trim() || queryLoading}
                    className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <span>Analyze</span>
                    <span>→</span>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 rounded-2xl border border-slate-800/80 bg-[#111827]/40 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <span className="text-4xl mb-3">📊</span>
              <h2 className="text-lg font-semibold text-slate-300">No Dataset Selected</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Upload a structured file (.csv, .xlsx, .pdf) or select an existing dataset from the left panel to run automated profiling.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}