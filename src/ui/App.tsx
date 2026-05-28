import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(5);

  const createRectangles = () => {
    parent.postMessage(
      { pluginMessage: { type: 'create-rectangles', count } },
      '*'
    );
  };

  const close = () => {
    parent.postMessage({ pluginMessage: { type: 'close' } }, '*');
  };

  return (
    <main className="container">
      <h2>React + Figma Test</h2>
      <label className="row">
        <span>Rectangles</span>
        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </label>
      <div className="actions">
        <button onClick={createRectangles}>Create</button>
        <button className="secondary" onClick={close}>Close</button>
      </div>
    </main>
  );
}
