import type { AnalysisTabSpec } from '../types';
import { RequirementListView } from './RequirementListView';
import { TraceabilityView } from './TraceabilityView';
import { OrphansView } from './OrphansView';

export const requirementAnalysisTabs: AnalysisTabSpec[] = [
  {
    id: 'requirement-list',
    label: 'Requirement list',
    render: () => <RequirementListView />,
  },
  {
    id: 'traceability',
    label: 'Traceability',
    render: () => <TraceabilityView />,
  },
  {
    id: 'orphans',
    label: 'Orphans',
    render: () => <OrphansView />,
  },
];
