// Default seed source for a fresh process-diagram session (UR-015).
//
// Unlike the requirement-diagram type, the process type has NO
// `!procedure` preamble — PlantUML activity is native, no macro DSL
// needed. The seed source is just an empty renderable scaffold: one
// `start` node so PlantUML Server can render the buffer from the
// first keystroke.

export const DEFAULT_PROCESS_SEED_SOURCE: string = `@startuml

start

@enduml
`;
