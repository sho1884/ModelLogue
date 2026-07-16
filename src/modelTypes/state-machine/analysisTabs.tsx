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
import { matrixToCsv } from '../../engines/matrixSerializer';
import { modelToCanonicalCsv } from './transitionTableSerializer';
import { useModelStore } from '../../stores/modelStore';
import type { AnalysisTabSpec } from '../types';
import type { StateMachineModel } from './model';

// modelStore.model is typed as a union across all model types; this
// tab set is only rendered inside state-machine sessions so the cast
// is safe by AnalysisPanel's dispatch.
function asStateMachineModel(m: unknown): StateMachineModel | null {
  if (!m || typeof m !== 'object' || !('states' in m)) return null;
  return m as StateMachineModel;
}

// State×Event exports the canonical state-transition-table CSV (SR-101 v7.4):
// state rows × event columns, richer than the on-screen grid (labels, parent,
// type, guards/actions), and round-trips with modellogue-nswitch.
function StateEventMatrixTab() {
  const matrix = useModelStore((s) => s.stateEventMatrix);
  const model = useModelStore((s) => asStateMachineModel(s.model));
  return (
    <MatrixView
      matrix={matrix}
      title="State \ Event"
      exportCsv={model ? modelToCanonicalCsv(model) : ''}
      exportSuffix="transitions"
      saveTitle="Download the canonical state-transition-table CSV (RFC 4180, shared format with modellogue-nswitch)."
    />
  );
}

// PreState×PostState has no canonical form — both axes are states — so it
// exports a faithful grid CSV of what is shown, NOT the state×event canonical
// CSV. Passing the canonical CSV here is what made both tabs download the same
// file.
function StateStateMatrixTab() {
  const matrix = useModelStore((s) => s.stateStateMatrix);
  return (
    <MatrixView
      matrix={matrix}
      title="From \ To"
      exportCsv={matrix ? matrixToCsv(matrix, 'From \\ To') : ''}
      exportSuffix="state-state"
      saveTitle="Download this PreState×PostState grid as CSV (the visible table; not the nswitch interchange format)."
    />
  );
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
