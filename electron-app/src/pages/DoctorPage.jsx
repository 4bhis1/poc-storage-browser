import React, { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "../components/ui/button";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Stethoscope,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import HeartbeatRibbon from "../components/HeartbeatRibbon";

const STATUS_ICON = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  warn: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  fail: <XCircle className="h-4 w-4 text-red-500" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  pending: <Clock className="h-4 w-4 text-amber-500" />,
};

const CARD_BORDER = {
  pass: "border-emerald-300 bg-emerald-50/40",
  warn: "border-yellow-300 bg-yellow-50/40",
  fail: "border-red-300 bg-red-50/40",
  running: "border-blue-300 bg-blue-50/40",
  pending: "border-amber-200 bg-amber-50/40",
  idle: "border-slate-200 bg-white",
};

const DIAG_NAMES = [
  "Disk I/O",
  "Service Health",
  "Clock Skew",
  "Proxy Detection",
  "Multipart Handshake",
];

export default function DoctorPage() {
  const [heartbeatLogs, setHeartbeatLogs] = useState([]);
  const [diagnostics, setDiagnostics] = useState({});
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [currentStatus, setCurrentStatus] = useState("UNKNOWN");
  const unsubRef = useRef(null);
  const diagnosticsRef = useRef(null);

  const loadHeartbeat = useCallback(async () => {
    if (!window.electronAPI?.doctor) return;
    const logs = await window.electronAPI.doctor.getHeartbeatHistory(60);
    setHeartbeatLogs(logs || []);
    if (logs?.length > 0) {
      const latest = logs[logs.length - 1];
      // SQLite datetime('now') stores UTC without a 'Z' suffix, so append it
      // to prevent JS from parsing the string as local time.
      const ts = latest.timestamp?.endsWith('Z') ? latest.timestamp : latest.timestamp + 'Z';
      const fresh = Date.now() - new Date(ts).getTime() < 120000;
      setCurrentStatus(
        fresh && latest.status === "SUCCESS" ? "ACTIVE" : "OFFLINE",
      );
    } else setCurrentStatus("UNKNOWN");
  }, []);

  const loadPersisted = useCallback(async () => {
    if (!window.electronAPI?.doctor) return;
    const last = await window.electronAPI.doctor.getLastDiagnostics();
    if (last?.length > 0) {
      const map = {};
      const exp = {};
      for (const d of last) {
        map[d.name] = { ...d, steps: d.steps || [] };
        exp[d.name] = true;
      }
      setDiagnostics(map);
      setExpanded(exp);
    }
  }, []);

  useEffect(() => {
    loadHeartbeat();
    loadPersisted();
    const iv = setInterval(loadHeartbeat, 30000);
    return () => clearInterval(iv);
  }, [loadHeartbeat, loadPersisted]);

  // Subscribe to live progress events
  useEffect(() => {
    if (!window.electronAPI?.doctor?.onDoctorProgress) return;
    const unsub = window.electronAPI.doctor.onDoctorProgress((evt) => {
      if (evt.type === "start") {
        setDiagnostics((prev) => ({
          ...prev,
          [evt.diagnostic]: {
            name: evt.diagnostic,
            status: "running",
            steps: [],
            detail: "Running...",
          },
        }));
        setExpanded((prev) => ({ ...prev, [evt.diagnostic]: true }));
      } else if (evt.type === "step") {
        setDiagnostics((prev) => ({
          ...prev,
          [evt.diagnostic]: {
            ...prev[evt.diagnostic],
            steps: evt.steps || [],
          },
        }));
      } else if (evt.type === "all-complete") {
        setRunning(false);
        if (evt.diagnostics) {
          const map = {};
          for (const d of evt.diagnostics)
            map[d.name] = { ...d, steps: d.steps || [] };
          setDiagnostics(map);
        }
      }
    });
    unsubRef.current = unsub;
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  // Subscribe to real-time heartbeat status pushes
  useEffect(() => {
    if (!window.electronAPI?.doctor?.onHeartbeatStatus) return;
    const unsub = window.electronAPI.doctor.onHeartbeatStatus((evt) => {
      setCurrentStatus(evt.status === "SUCCESS" ? "ACTIVE" : "OFFLINE");
      // Reload full history so ribbon updates immediately
      loadHeartbeat();
    });
    return () => unsub();
  }, [loadHeartbeat]);

  async function runAll() {
    if (!window.electronAPI?.doctor) return;
    setRunning(true);
    // Mark all as pending
    const pending = {};
    DIAG_NAMES.forEach((n) => {
      pending[n] = { name: n, status: "pending", steps: [], detail: "Waiting..." };
    });
    setDiagnostics(pending);
    setExpanded(Object.fromEntries(DIAG_NAMES.map((n) => [n, true])));

    // Run diagnostics sequentially with 5s delay between each
    for (let i = 0; i < DIAG_NAMES.length; i++) {
      const name = DIAG_NAMES[i];
      setDiagnostics((prev) => ({
        ...prev,
        [name]: { ...prev[name], status: "running", detail: "Running..." },
      }));
      
      // Scroll to diagnostics section
      setTimeout(() => {
        diagnosticsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      
      const result = await window.electronAPI.doctor.runSingle(name);
      setDiagnostics((prev) => ({
        ...prev,
        [name]: { ...result, steps: result.steps || [] },
      }));
      
      // Wait 5 seconds before next diagnostic (except after the last one)
      if (i < DIAG_NAMES.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    setRunning(false);
  }

  async function runSingle(name) {
    if (!window.electronAPI?.doctor) return;
    setDiagnostics((prev) => ({
      ...prev,
      [name]: { name, status: "running", steps: [], detail: "Running..." },
    }));
    setExpanded((prev) => ({ ...prev, [name]: true }));
    const result = await window.electronAPI.doctor.runSingle(name);
    setDiagnostics((prev) => ({
      ...prev,
      [name]: { ...result, steps: result.steps || [] },
    }));
  }

  function toggle(name) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  const diagList = DIAG_NAMES.map(
    (n) =>
      diagnostics[n] || {
        name: n,
        status: "idle",
        steps: [],
        detail: "Not run yet",
      },
  ).sort((a, b) => {
    // Running diagnostic always first
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    // Pending diagnostics next
    if (a.status === "pending" && b.status !== "pending" && b.status !== "running") return -1;
    if (b.status === "pending" && a.status !== "pending" && a.status !== "running") return 1;
    // Keep original order otherwise
    return DIAG_NAMES.indexOf(a.name) - DIAG_NAMES.indexOf(b.name);
  });

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-3 rounded-xl">
              <Stethoscope className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Agent Doctor
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Health checks and diagnostics
              </p>
            </div>
          </div>
        </div>

        <HeartbeatRibbon logs={heartbeatLogs} currentStatus={currentStatus} />

        {/* Diagnostics */}
        <div ref={diagnosticsRef}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              System Diagnostics
            </h2>
            <Button onClick={runAll} disabled={running} className="gap-2">
              <RefreshCw
                className={`h-4 w-4 ${running ? "animate-spin" : ""}`}
              />
              {running ? "Running..." : "Run All Diagnostics"}
            </Button>
          </div>
          <div className="space-y-3">
            {diagList.reverse().map((diag) => {
              const isOpen = expanded[diag.name];
              const cardStatus = diag.status || "idle";
              return (
                <div
                  key={diag.name}
                  className={`rounded-2xl border-2 shadow-sm transition-all ${CARD_BORDER[cardStatus] || CARD_BORDER.idle}`}
                >
                  {/* Card header */}
                  <div
                    className="flex items-center justify-between px-5 py-4 cursor-pointer select-none"
                    onClick={() => toggle(diag.name)}
                  >
                    <div className="flex items-center gap-3">
                      {STATUS_ICON[cardStatus] || (
                        <Clock className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="font-bold text-slate-900">
                        {diag.name}
                      </span>
                      {diag.durationMs > 0 && (
                        <span className="text-xs text-slate-400 ml-1">
                          {diag.durationMs}ms
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          runSingle(diag.name);
                        }}
                        disabled={running || cardStatus === "running"}
                        className="h-7 w-7 p-0"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${cardStatus === "running" ? "animate-spin" : ""}`}
                        />
                      </Button>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expandable steps */}
                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-slate-100">
                      {diag.steps && diag.steps.length > 0 ? (
                        <div className="mt-3 space-y-1.5">
                          {diag.steps.map((step, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-sm animate-fadeIn"
                            >
                              {step.status === "pass" && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              )}
                              {step.status === "warn" && (
                                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                              )}
                              {step.status === "fail" && (
                                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              )}
                              <span className="text-slate-700">
                                {step.label}
                              </span>
                              {step.ms > 0 && (
                                <span className="text-xs text-slate-400 ml-auto">
                                  {step.ms}ms
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 mt-3 italic">
                          {cardStatus === "running"
                            ? "Starting..."
                            : cardStatus === "idle"
                              ? "Not run yet"
                              : diag.detail || "No steps recorded"}
                        </p>
                      )}
                      {diag.detail && diag.steps?.length > 0 && (
                        <p className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100">
                          {diag.detail}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
