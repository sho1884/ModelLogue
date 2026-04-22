// State-machine analysis tabs — the three tab specs contributed by
// the state-machine ModelTypeDefinition (ADR-012 §17.2):
//   State×Event, State×State, Test cases.
//
// Each wrapper component pulls from the stores that back its view —
// AnalysisPanel only decides which tab is active and calls the
// spec's render(). This is what makes Step 5 (requirement analysis
// tabs) land without touching AnalysisPanel.tsx.

import { MatrixView } from '../../components/AnalysisPanel/MatrixView';
import { TestCasesView } from '../../components/AnalysisPanel/TestCasesView';
import { useModelStore } from '../../stores/modelStore';
import type { AnalysisTabSpec } from '../types';

function StateEventMatrixTab() {
  const matrix = useModelStore((s) => s.stateEventMatrix);
  const model = useModelStore((s) => s.model);
  return <MatrixView matrix={matrix} model={model} title="State \ Event" />;
}

function StateStateMatrixTab() {
  const matrix = useModelStore((s) => s.stateStateMatrix);
  const model = useModelStore((s) => s.model);
  return <MatrixView matrix={matrix} model={model} title="From \ To" />;
}

export const stateMachineAnalysisTabs: AnalysisTabSpec[] = [
  {
    id: 'state-event',
    label: 'State×Event',
    render: () => <StateEventMatrixTab />,
  },
  {
    id: 'state-state',
    label: 'State×State',
    render: () => <StateStateMatrixTab />,
  },
  {
    id: 'test-cases',
    label: 'Test cases',
    render: () => <TestCasesView />,
  },
];
