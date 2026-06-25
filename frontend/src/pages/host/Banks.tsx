import { useEffect, useState } from "react";
import {
  BankQuestion,
  BankSummary,
  listBanks,
  previewBank,
  uploadBank,
} from "../../lib/api";

export default function Banks() {
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<{ count: number; skipped: number } | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);

  const refresh = () => listBanks().then(setBanks).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  async function doUpload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await uploadBank(name || file.name, file);
      await refresh();
      setImported({ count: res.imported, skipped: res.errors.length });
      setName("");
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-grid2">
      <div className="host-card">
        <h2>Upload a bank</h2>
        <p className="host-help">
          CSV or XLSX with columns: type, content, correct_answer, options, category, difficulty, hint.
          Use <b>poll</b> rows (blank answer, pipe-separated options) for polls; add a <b>hint</b> for
          puzzles &amp; treasure hunts.
        </p>
        <label>Bank name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="General Knowledge Pack" />
        <label>File</label>
        <label className="host-drop">
          <div className="big">⬆</div>
          <b>{file ? file.name : "Choose a file to upload"}</b>
          <span>.csv · .xlsx · .xls</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div style={{ height: 14 }} />
        <button className="host-btn host-btn-gold host-btn-block" onClick={doUpload} disabled={!file || busy}>
          {busy ? "Uploading…" : "Upload bank"}
        </button>
        {imported && (
          <div className="host-pill">
            ✓ {imported.count} questions imported
            {imported.skipped ? ` · ${imported.skipped} rows skipped` : ""}
          </div>
        )}
        {error && <div className="host-error">{error}</div>}
      </div>

      <div className="host-card">
        <h2>Your banks</h2>
        {banks.length === 0 ? (
          <p className="host-empty">No banks yet. Upload one to get started.</p>
        ) : (
          banks.map((b) => (
            <div key={b.id} className="evt-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span className="nm" style={{ display: "flex", flexDirection: "column" }}>
                <b>{b.name}</b>
                <span className="meta">
                  {b.question_count} questions · difficulty {b.difficulty_range[0]}–{b.difficulty_range[1]}
                  {b.categories.length ? ` · ${b.categories.slice(0, 3).join(", ")}` : ""}
                </span>
              </span>
              <button
                className="host-btn host-btn-ghost"
                onClick={() => setPreviewId(previewId === b.id ? null : b.id)}
              >
                {previewId === b.id ? "Hide" : "Preview"}
              </button>
            </div>
          ))
        )}
        {previewId != null && <Preview bankId={previewId} />}
      </div>
    </div>
  );
}

function Preview({ bankId }: { bankId: number }) {
  const [rows, setRows] = useState<BankQuestion[] | null>(null);
  useEffect(() => {
    setRows(null);
    previewBank(bankId).then(setRows).catch(() => setRows([]));
  }, [bankId]);

  if (rows == null) return <p className="host-empty" style={{ marginTop: 14 }}>Loading…</p>;
  if (rows.length === 0) return <p className="host-empty" style={{ marginTop: 14 }}>No questions.</p>;

  return (
    <div className="qprev-scroll" style={{ marginTop: 16 }}>
      <table className="qprev">
        <thead>
          <tr>
            <th>Type</th>
            <th>Content</th>
            <th>Category</th>
            <th>Diff.</th>
            <th>Hint</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id}>
              <td>{q.type}</td>
              <td>
                {q.content}
                {q.options && <div className="meta">{q.options.join(" · ")}</div>}
              </td>
              <td>{q.category}</td>
              <td>{q.difficulty}</td>
              <td>{q.hint || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
