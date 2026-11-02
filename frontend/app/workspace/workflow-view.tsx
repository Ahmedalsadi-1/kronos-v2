import { getApi } from "@/store/global";
import { atom } from "jotai";

export class WorkflowViewModel implements ViewModel {
    viewType = "workflow";
    viewName = atom("Workflow canvas");
    viewIcon = atom("diagram-project");
    noPadding = atom(true);
    viewComponent = WorkflowView;
    constructor(_input: ViewModelInitType) {}
}
function WorkflowView() {
    return (
        <div className="flex h-full items-center justify-center p-4">
            <button
                type="button"
                className="cursor-pointer rounded border p-3"
                onClick={() =>
                    void getApi().hermesApi({
                        path: "/api/kronterm/n8n/command",
                        method: "POST",
                        body: { operation: "open", surface: "canvas" },
                    })
                }
            >
                Open workflow on the OS canvas
            </button>
        </div>
    );
}
