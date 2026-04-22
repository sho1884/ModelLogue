// Re-export of the requirement-diagram EBNF as a string, so it can be
// served through the download-grammar action (SR-081 analogue) and
// referenced from the ModelTypeDefinition.

import grammar from '../../grammars/requirementDiagram.ebnf?raw';

export const REQUIREMENT_DIAGRAM_GRAMMAR: string = grammar;
