import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBarChart,
  RadialBar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const THEME_COLORS = [
  "#6366f1",
  "#06b6d4",
  "#a855f7",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
];

// Universal Formatter for Y-Axis numbers (K, M, B)
const formatNumberCompact = (val) => {
  if (typeof val !== "number") return val;
  const abs = Math.abs(val);
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
  return val;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0b101d] border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs font-mono">
        {label && <p className="text-slate-300 font-semibold mb-1">{label}</p>}
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color || "#818cf8" }} className="flex gap-3 justify-between">
            <span>{entry.name || entry.dataKey}:</span>
            <span className="font-bold">
              {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function DynamicChart({ chartConfig }) {
  if (!chartConfig) return null;

  let config = chartConfig;
  if (!config.data && config.chart && config.chart.data) config = config.chart;
  if (!config.data && config.config && config.config.data) config = config.config;

  if (!config.data || !Array.isArray(config.data) || config.data.length < 2) {
    return null;
  }

  let {
    type = "bar",
    title = "Data Visualization",
    data = [],
    xKey = "name",
    yKeys = ["value"],
  } = config;

  const firstRow = data[0] || {};
  const availableKeys = Object.keys(firstRow);

  if (!availableKeys.includes(xKey)) {
    xKey =
      availableKeys.find((k) => typeof firstRow[k] === "string") ||
      availableKeys.find(
        (k) =>
          k.toLowerCase().includes("name") ||
          k.toLowerCase().includes("rating") ||
          k.toLowerCase().includes("sop") ||
          k.toLowerCase().includes("category") ||
          k.toLowerCase().includes("geography") ||
          k.toLowerCase().includes("tier")
      ) ||
      availableKeys[0];
  }

  const validYKeys = Array.isArray(yKeys) ? yKeys.filter((k) => availableKeys.includes(k)) : [];
  if (validYKeys.length === 0) {
    const numericKeys = availableKeys.filter(
      (k) => k !== xKey && typeof firstRow[k] === "number"
    );
    yKeys = numericKeys.length > 0 ? numericKeys : availableKeys.filter((k) => k !== xKey);
    if (yKeys.length === 0 && availableKeys.length > 0) {
      yKeys = [availableKeys[0]];
    }
  } else {
    yKeys = validYKeys;
  }

  const chartType = String(type).toLowerCase();

  return (
    <div className="my-4 p-4.5 rounded-2xl bg-[#090d18] border border-indigo-950/60 shadow-lg flex flex-col gap-3">
      {title && (
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span>📈</span> {title}
          </span>
          <span className="text-[10px] font-mono uppercase bg-indigo-950/70 border border-indigo-800/50 text-indigo-300 px-2.5 py-0.5 rounded-full">
            {chartType} chart
          </span>
        </div>
      )}

      <div className="w-full h-72 sm:h-80 text-xs font-mono">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "pie" ? (
            <PieChart>
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
              <Pie
                data={data}
                dataKey={yKeys[0] || "value"}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={85}
                paddingAngle={4}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={THEME_COLORS[index % THEME_COLORS.length]}
                    stroke="#0b101d"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
            </PieChart>
          ) : chartType === "line" ? (
            <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey={xKey} stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={["auto", "auto"]}
                tickFormatter={formatNumberCompact}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {yKeys.map((key, idx) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={THEME_COLORS[idx % THEME_COLORS.length]}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: THEME_COLORS[idx % THEME_COLORS.length] }}
                />
              ))}
            </LineChart>
          ) : chartType === "area" ? (
            <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey={xKey} stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={["auto", "auto"]}
                tickFormatter={formatNumberCompact}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {yKeys.map((key, idx) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={THEME_COLORS[idx % THEME_COLORS.length]}
                  fill={THEME_COLORS[idx % THEME_COLORS.length]}
                  fillOpacity={0.25}
                />
              ))}
            </AreaChart>
          ) : chartType === "composed" ? (
            <ComposedChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey={xKey} stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={["auto", "auto"]}
                tickFormatter={formatNumberCompact}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey={yKeys[0]} fill="#6366f1" radius={[6, 6, 0, 0]} />
              {yKeys[1] && <Line type="monotone" dataKey={yKeys[1]} stroke="#10b981" strokeWidth={2.5} />}
            </ComposedChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey={xKey} stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={["auto", "auto"]}
                tickFormatter={formatNumberCompact}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {yKeys.map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={THEME_COLORS[idx % THEME_COLORS.length]}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}