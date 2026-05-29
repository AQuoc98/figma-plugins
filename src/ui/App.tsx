import { useEffect, useMemo, useState } from 'react';

type Selection = {
  id: string;
  name: string;
  type: string;
  childCount: number;
} | null;

type ExportResult = {
  fileName: string;
  json: unknown;
} | null;

const EXPORTABLE = [
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'GROUP',
  'SECTION',
];

export function App() {
  const [selection, setSelection] = useState<Selection>(null);
  const [result, setResult] = useState<ExportResult>(null);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      if (msg.type === 'selection') {
        setSelection(msg.selection);
      } else if (msg.type === 'export-result') {
        setResult({ fileName: msg.fileName, json: msg.json });
        setProgress('');
        setError('');
      } else if (msg.type === 'export-progress') {
        setProgress(msg.message || '');
        setError('');
      } else if (msg.type === 'export-error') {
        setError(msg.message || 'Export failed');
        setProgress('');
      }
    };
    window.addEventListener('message', handler);
    parent.postMessage({ pluginMessage: { type: 'request-selection' } }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const jsonText = useMemo(
    () => (result ? JSON.stringify(result.json, null, 2) : ''),
    [result]
  );

  const exportJson = () => {
    setResult(null);
    setError('');
    setProgress('Starting...');
    parent.postMessage({ pluginMessage: { type: 'export' } }, '*');
  };

  const exportLibrary = () => {
    setResult(null);
    setError('');
    setProgress('Starting...');
    parent.postMessage({ pluginMessage: { type: 'export-library' } }, '*');
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    if (!jsonText) return;
    try {
      await navigator.clipboard.writeText(jsonText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = jsonText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const close = () => {
    parent.postMessage({ pluginMessage: { type: 'close' } }, '*');
  };

  const canExport = !!selection && EXPORTABLE.includes(selection.type);

  return (
    <main className="container">
      <h2>Export Selection to JSON</h2>

      <section className="card">
        {selection ? (
          <>
            <div className="row">
              <span className="label">Name</span>
              <span className="value" title={selection.name}>
                {selection.name}
              </span>
            </div>
            <div className="row">
              <span className="label">Type</span>
              <span className="value">{selection.type}</span>
            </div>
            <div className="row">
              <span className="label">Children</span>
              <span className="value">{selection.childCount}</span>
            </div>
          </>
        ) : (
          <div className="empty">No selection. Select a frame or component.</div>
        )}
      </section>

      <div className="actions">
        <button onClick={exportJson} disabled={!canExport}>
          Export JSON
        </button>
        <button className="secondary" onClick={close}>
          Close
        </button>
      </div>

      <div className="actions">
        <button onClick={exportLibrary}>
          Export Library (colors, tokens, icons)
        </button>
      </div>

      {progress && !result && (
        <div className="empty">{progress}</div>
      )}
      {error && (
        <div className="empty" style={{ color: '#c00' }}>{error}</div>
      )}

      {result && (
        <section className="result">
          <div className="row">
            <span className="label">{result.fileName}</span>
            <div className="result-actions">
              <button className="ghost" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button className="ghost" onClick={download}>
                Download
              </button>
            </div>
          </div>
          <pre className="json">{jsonText}</pre>
        </section>
      )}
    </main>
  );
}
