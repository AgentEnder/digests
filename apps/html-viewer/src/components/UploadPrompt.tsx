import { useState, useRef, useCallback, type DragEvent } from 'react';
import styles from './UploadPrompt.module.css';

interface UploadPromptProps {
  fetchError: string;
  onFileSelect: (file: File) => void;
}

export function UploadPrompt({ fetchError, onFileSelect }: UploadPromptProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleInputChange = useCallback(() => {
    const file = inputRef.current?.files?.[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Dependency Digest</h1>
        <p className={styles.subtitle}>
          Could not load <code className={styles.code}>digest.json</code> automatically.
        </p>
        <p className={styles.hint}>
          This viewer expects a <code className={styles.code}>digest.json</code> file
          in the same directory. You can also load one manually below.
        </p>

        <div
          className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
        >
          <div className={styles.dropIcon}>📄</div>
          <p className={styles.dropText}>
            Drop a <code className={styles.code}>digest.json</code> file here
          </p>
          <p className={styles.dropOr}>or</p>
          <button className={styles.browseButton} type="button">
            Browse files
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className={styles.hiddenInput}
            onChange={handleInputChange}
          />
        </div>

        <details className={styles.details}>
          <summary>How to generate a digest</summary>
          <p>
            Run <code className={styles.code}>npx dependency-digest --format json --output ./digest.json</code> in
            your project directory, then either:
          </p>
          <ul>
            <li>Place the JSON file next to this HTML file and refresh</li>
            <li>Or drag and drop it onto this page</li>
          </ul>
        </details>

        <p className={styles.error}>
          Fetch error: {fetchError}
        </p>
      </div>
    </div>
  );
}
