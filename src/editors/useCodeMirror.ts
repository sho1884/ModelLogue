// React hook for CodeMirror 6 integration

import { useRef, useEffect } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { plantumlLanguage } from './plantumlLanguage';

interface UseCodeMirrorOptions {
  value: string;
  onChange: (value: string) => void;
}

export function useCodeMirror({ value, onChange }: UseCodeMirrorOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        history(),
        plantumlLanguage,
        oneDark,
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create editor once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return containerRef;
}
