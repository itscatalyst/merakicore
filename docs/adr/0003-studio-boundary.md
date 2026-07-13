# ADR 0003: Studio is a required control/proof surface

Status: accepted

Studio is required by the completion goal but is not canonical storage. It uses a generated client, paginated read models, authenticated replayable notifications, and versioned domain commands. Core never imports Studio. Visual graph layout is local presentation state and cannot alter profile semantics.
