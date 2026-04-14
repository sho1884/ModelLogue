import { useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { CloseSessionDialog } from '../CloseSessionDialog';

export function Header() {
  const sessionName = useSessionStore((s) => s.sessionName);
  const outcome = useSessionStore((s) => s.outcome);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  return (
    <>
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-800">ModelLogue</h1>
          <span className="text-sm text-gray-500">{sessionName}</span>
          {outcome && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
              {outcome.status === 'consensus' && '✓ 合意形成'}
              {outcome.status === 'postponed' && '⏸ 保留'}
              {outcome.status === 'spec_issue' && '⚠ 仕様不備'}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCloseDialog(true)}
          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
        >
          セッション終了
        </button>
      </header>
      {showCloseDialog && (
        <CloseSessionDialog onClose={() => setShowCloseDialog(false)} />
      )}
    </>
  );
}
