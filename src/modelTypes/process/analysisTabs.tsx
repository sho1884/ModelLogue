// Analysis tabs contributed by the `process` model type (SR-071, v7.6).

import type { AnalysisTabSpec } from '../types';
import { ScenariosView } from './ScenariosView';
import { EventsView } from './EventsView';
import { RolesView } from './RolesView';
import { ArtifactsView } from './ArtifactsView';
import { ExternalsView } from './ExternalsView';

export const processAnalysisTabs: AnalysisTabSpec[] = [
  {
    id: 'process-scenarios',
    label: 'Scenarios',
    render: () => <ScenariosView />,
  },
  {
    id: 'process-events',
    label: 'Events',
    render: () => <EventsView />,
  },
  {
    id: 'process-roles',
    label: 'Roles',
    render: () => <RolesView />,
  },
  {
    id: 'process-artifacts',
    label: 'Artifacts',
    render: () => <ArtifactsView />,
  },
  {
    id: 'process-externals',
    label: 'Externals',
    render: () => <ExternalsView />,
  },
];
