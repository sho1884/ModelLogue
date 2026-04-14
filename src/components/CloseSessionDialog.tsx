import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import type { SessionOutcomeStatus } from '../types/session';

const OUTCOMES: {
  status: SessionOutcomeStatus;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    status: 'consensus',
    label: '合意形成',
    description: '指摘がすべて解消され、モデルが承認された',
    color: 'bg-green-600 hover:bg-green-700',
  },
  {
    status: 'postponed',
    label: 'モデル修正保留',
    description: '修正案がまとまらず、次回レビューに持ち越す',
    color: 'bg-yellow-600 hover:bg-yellow-700',
  },
  {
    status: 'spec_issue',
    label: '要求仕様の不備発覚',
    description: '上流の仕様に矛盾・漏れ等があり、仕様側の修正が必要',
    color: 'bg-red-600 hover:bg-red-700',
  },
];

interface CloseSessionDialogProps {
  onClose: () => void;
}

export function CloseSessionDialog({ onClose }: CloseSessionDialogProps) {
  const closeSession = useSessionStore((s) => s.closeSession);
  const exportSession = useSessionStore((s) => s.exportSession);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  const handleClose = (status: SessionOutcomeStatus) => {
    closeSession(status, note.trim() || null);

    const session = exportSession();
    const json = JSON.stringify(session, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    a.href = url;
    a.download = `modellogue-session-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDone(true);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            セッション終了
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            セッションのエビデンスがダウンロードされました。
            このファイルをn8nワークフローに渡すことで、後続のタスクに引き継げます。
          </p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded bg-gray-600 text-white hover:bg-gray-700"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          レビューセッションを終了する
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          結末を選んでください。セッションの全記録がJSONファイルとしてダウンロードされます。
        </p>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            メモ（任意）
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="レビューの結論や補足事項があれば記入..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="space-y-2 mb-4">
          {OUTCOMES.map((o) => (
            <button
              key={o.status}
              onClick={() => handleClose(o.status)}
              className={`w-full text-left px-4 py-3 rounded text-white ${o.color}`}
            >
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-xs opacity-80">{o.description}</div>
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
