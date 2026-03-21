import { useState, useEffect, useCallback } from 'react';
import type { DigestOutput } from './types.js';

type DigestDataState =
  | { status: 'loading' }
  | { status: 'loaded'; data: DigestOutput }
  | { status: 'needs-upload'; fetchError: string };

export function useDigestData(): {
  state: DigestDataState;
  loadFromFile: (file: File) => void;
} {
  const [state, setState] = useState<DigestDataState>({ status: 'loading' });

  useEffect(() => {
    fetch('./digest.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: DigestOutput) => {
        setState({ status: 'loaded', data });
      })
      .catch((err: Error) => {
        setState({ status: 'needs-upload', fetchError: err.message });
      });
  }, []);

  const loadFromFile = useCallback((file: File) => {
    setState({ status: 'loading' });

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as DigestOutput;
        if (!data.scannedAt || !Array.isArray(data.manifests)) {
          throw new Error('Invalid digest format: missing scannedAt or manifests');
        }
        setState({ status: 'loaded', data });
      } catch (err) {
        setState({
          status: 'needs-upload',
          fetchError: err instanceof Error ? err.message : 'Failed to parse file',
        });
      }
    };
    reader.onerror = () => {
      setState({ status: 'needs-upload', fetchError: 'Failed to read file' });
    };
    reader.readAsText(file);
  }, []);

  return { state, loadFromFile };
}
