# Timeline 2 Domain Zone

The current Timeline 2 domain core still lives in [../index.ts](../index.ts).

Start there for changes to:

- snapshot building
- revisions
- branch persistence and operation application
- dependency and hierarchy validation
- critical-path and workload logic
- AI proposal generation internals

This zone is documented explicitly so the next refactor can move domain logic out of `index.ts` without changing the feature map.
