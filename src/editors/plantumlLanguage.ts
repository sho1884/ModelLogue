// Simple PlantUML state diagram syntax highlighting for CodeMirror 6

import { StreamLanguage, type StreamParser } from '@codemirror/language';

interface PlantUmlState {
  inBlock: boolean;
}

const plantumlParser: StreamParser<PlantUmlState> = {
  startState: () => ({ inBlock: false }),

  token(stream, state) {
    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Comments
    if (stream.match(/^'.*/)) return 'comment';
    if (stream.match(/^#.*/)) return 'comment';

    // Directives
    if (stream.match(/^@startuml\b/)) {
      state.inBlock = true;
      return 'keyword';
    }
    if (stream.match(/^@enduml\b/)) {
      state.inBlock = false;
      return 'keyword';
    }

    // Keywords
    if (stream.match(/^state\b/)) return 'keyword';
    if (stream.match(/^as\b/)) return 'keyword';

    // Arrow
    if (stream.match(/^-+>/)) return 'operator';

    // Initial/final state
    if (stream.match(/^\[\*\]/)) return 'atom';

    // Quoted string
    if (stream.match(/^"[^"]*"/)) return 'string';

    // Guard brackets
    if (stream.match(/^\[[^\]]*\]/)) return 'meta';

    // Action after /
    if (stream.match(/^\/\s*.+/)) return 'variableName';

    // Colon (transition label separator)
    if (stream.eat(':')) return 'punctuation';

    // Identifier
    stream.match(/^[\w\u3040-\u9FFF]+/) || stream.next();
    return null;
  },
};

export const plantumlLanguage = StreamLanguage.define(plantumlParser);
