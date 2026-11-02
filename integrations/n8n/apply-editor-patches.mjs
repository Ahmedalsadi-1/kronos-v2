// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const layouts = path.join(root, "upstream/packages/frontend/editor-ui/src/app/layouts");

function patch(filename, changes) {
    const target = path.join(layouts, filename);
    let source = fs.readFileSync(target, "utf8");
    for (const [before, after] of changes) {
        if (source.includes(after)) continue;
        if (!source.includes(before)) throw new Error(`n8n source changed: cannot patch ${filename}`);
        source = source.replace(before, after);
    }
    fs.writeFileSync(target, source);
}

fs.copyFileSync(path.join(root, "editor/KronTermExecutions.vue"), path.join(layouts, "KronTermExecutions.vue"));
patch("DefaultLayout.vue", [
    ["import BaseLayout from './BaseLayout.vue';", "import BaseLayout from './BaseLayout.vue';\nimport { useSettingsStore } from '@n8n/stores/settings.store';\nconst settingsStore = useSettingsStore();"],
    ['<template #sidebar>', '<template v-if="!settingsStore.isCanvasOnly" #sidebar>'],
]);
patch("SettingsLayout.vue", [
    ["const router = useRouter();", "const router = useRouter();\nconst settingsStore = useSettingsStore();"],
    ["import { useRouter } from 'vue-router';", "import { useRouter } from 'vue-router';\nimport { useSettingsStore } from '@n8n/stores/settings.store';"],
    ['<template #sidebar>', '<template v-if="!settingsStore.isCanvasOnly" #sidebar>'],
]);
patch("WorkflowLayout.vue", [
    ["import BaseLayout from './BaseLayout.vue';", "import BaseLayout from './BaseLayout.vue';\nimport KronTermExecutions from './KronTermExecutions.vue';\nimport { useRoute } from 'vue-router';\nimport { useUIStore } from '@/app/stores/ui.store';"],
    ["const isCanvasOnly = settingsStore.isCanvasOnly;", "const isCanvasOnly = settingsStore.isCanvasOnly;\nconst route = useRoute();\nconst uiStore = useUIStore();\ndeclare global { interface Window { krontermWorkflowState?: () => { id: string; dirty: boolean } } }"],
    ["await initializeWorkflow();", "await initializeWorkflow();\n\tif (isCanvasOnly) window.krontermWorkflowState = () => ({ id: workflowId.value ?? '', dirty: uiStore.stateIsDirty });"],
    ["cleanup();\n});", "cleanup();\n\tif (isCanvasOnly) delete window.krontermWorkflowState;\n});"],
    ['<template v-if="layoutProps.logs" #footer>', '<template v-if="isCanvasOnly && !route.path.includes(\'/executions\') && !route.path.includes(\'/evaluation\')" #aside>\n\t\t\t<KronTermExecutions :workflow-id="workflowId" />\n\t\t</template>\n\t\t<template v-if="layoutProps.logs" #footer>'],
]);
console.log("Applied KronTerm canvas, execution sidebar, and connected widget layouts.");
