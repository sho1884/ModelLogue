// Analysis tabs contributed by the `process` model type (SR-071).
//
// The full tab implementations land in v7.6 step 6; this file gives
// each tab its id, label, and a placeholder view so AnalysisPanel can
// render the tab set immediately once `process` is registered, and
// the tabs can be swapped to their real implementations one by one.

import type { AnalysisTabSpec } from '../types';

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400 italic p-4 text-center">
      <div>
        {label} は v7.6 step 6 で実装予定
        <div className="text-xs mt-2 not-italic text-gray-500">
          仕様は Doc/requirements/Requirements_Specification.md §3.15.4 と
          system_requirements.yaml SR-120〜125 を参照
        </div>
      </div>
    </div>
  );
}

export const processAnalysisTabs: AnalysisTabSpec[] = [
  {
    id: 'process-scenarios',
    label: 'Scenarios',
    render: () => <Placeholder label="Scenarios タブ (SR-120)" />,
  },
  {
    id: 'process-events',
    label: 'Events',
    render: () => <Placeholder label="Events タブ (SR-121)" />,
  },
  {
    id: 'process-roles',
    label: 'Roles',
    render: () => <Placeholder label="Roles タブ (SR-122)" />,
  },
  {
    id: 'process-artifacts',
    label: 'Artifacts',
    render: () => <Placeholder label="Artifacts タブ (SR-123)" />,
  },
  {
    id: 'process-externals',
    label: 'Externals',
    render: () => <Placeholder label="Externals タブ (SR-125)" />,
  },
];
