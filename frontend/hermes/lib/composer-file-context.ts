import { requestComposerInsertRefs } from "@hermes/app/chat/composer/focus";
import { droppedFileInlineRef } from "@hermes/app/chat/composer/inline-refs";

export function attachPathToComposer(path: string, cwd: string, isDirectory = false) {
    const ref = droppedFileInlineRef({ path, isDirectory }, cwd);
    if (ref) requestComposerInsertRefs([ref]);
}
