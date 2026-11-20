import { stages } from "./samples";

export function planMarkdown(task) {
    if (task.planRevision?.trim()) {
        return task.planRevision;
    }
    return [
        "# " + task.title.replace(/\s+/g, " "),
        "",
        "Review the local sample sources and prepare a Markdown brief.",
        ...(task.notes?.length ? ["Follow-up: " + task.notes.at(-1).replace(/\s+/g, " ")] : []),
        "",
        ...stages.map(([title, description], index) => (index + 1) + ". " + title + " — " + description),
    ].join("\n");
}

export function parsePlan(markdown) {
    const title = markdown.match(/^#[ \t]+(.+)$/m)?.[1]?.trim();
    const description = [];
    const todos = [];
    for (const [lineIndex, raw] of markdown.split("\n").entries()) {
        const line = raw.trim();
        if (!line || /^#\s/.test(line)) {
            continue;
        }
        const item = line.match(/^(?:\d+[.)]|[-*+])\s+(.+)$/);
        if (!item) {
            description.push(line.replace(/^#{2,6}\s+/, ""));
            continue;
        }
        const [itemTitle, ...detail] = item[1].split(" — ");
        todos.push({ title: itemTitle, detail: detail.join(" — "), lineIndex });
    }
    return { title, description, todos };
}

export function planSteps(task) {
    return parsePlan(planMarkdown(task)).todos.map(({ title, detail }) => [title, detail]);
}
