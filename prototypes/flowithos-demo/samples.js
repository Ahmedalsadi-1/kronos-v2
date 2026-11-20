export const sites = [
    { title: "Google", host: "www.google.com", mark: "G", color: "#4285f4" },
    { title: "Hacker News", host: "news.ycombinator.com", mark: "Y", color: "#f26522" },
    { title: "GitHub", host: "github.com", mark: "GH", color: "#232733" },
    { title: "arXiv", host: "arxiv.org", mark: "a", color: "#b31b1b" },
    { title: "Wikipedia", host: "en.wikipedia.org", mark: "W", color: "#515762" },
];

export const presets = [
    ["Hacker News Digest", "Summarize the latest stories on Hacker News and highlight the most interesting discussions."],
    ["Research Assistant", "Find sample papers on generative AI in education and turn them into a reading list."],
    ["Restaurant Finder", "Compare three fictional restaurants for a weekend dinner and create a shortlist."],
    ["Draft a Post for X", "Draft a short post about an interesting story from the sample Hacker News feed."],
    ["Compare Repositories", "Compare the example open source projects and list their key differences."],
    ["Plan a City Break", "Build a two-day sample itinerary with a museum, a bookshop, and a walk."],
    ["Prepare a Reading Brief", "Make a one-page brief from the sample research library."],
    ["Turn Notes Into a Checklist", "Organize example project notes into a checklist with next steps."],
];

export const stories = [
    ["A quieter way to browse the web", "A small team explores how traditional tabs, bookmarks, and an activity log fit together."],
    ["Building an offline research notebook", "A sample architecture for storing sources and notes together on your device."],
    ["What we learned from teaching with language models", "An illustrative survey of classroom feedback and ways to evaluate AI-assisted work."],
    ["A tiny tool for comparing open source licenses", "A fictional project that helps maintainers compare terms before choosing dependencies."],
    ["Making drag and drop work on a canvas", "A sample discussion about keyboard access, spatial layouts, and snapping behavior."],
];

export const siteEntries = [
    stories,
    stories,
    [
        ["papertrail / notebook", "A fictional offline notebook for collecting citations and tagging research notes."],
        ["smalltools / licenses", "A sample command-line tool that compares open source license terms."],
        ["maproom / canvas", "A fictional canvas editor with node connections and keyboard navigation."],
    ],
    [
        ["Generative AI as a classroom collaborator", "An illustrative preprint on how students revise writing with language models."],
        ["Assessing AI-supported learning outcomes", "A sample research abstract about rubric design and feedback in classrooms."],
        ["A survey of local-first research tools", "A fictional survey of citation managers, notebooks, and offline search."],
    ],
    [
        ["Local-first software", "An example encyclopedia entry about keeping primary data on the user's device."],
        ["Knowledge graph", "An example entry about representing people, places, and ideas as connected entities."],
        ["Computer-assisted education", "An example entry about software that supports teaching and learning."],
    ],
];

export const stages = [
    ["Plan the task", "Break the request into a short checklist."],
    ["Open the sample sources", "Open a local preview and identify relevant entries."],
    ["Review and organize findings", "Compare the example content and prepare a draft."],
    ["Save the result", "Create a Markdown brief in the Files tab."],
];

export function taskSource(title) {
    if (/research|paper|reading|arxiv|education/i.test(title)) return 3;
    if (/github|repositor|open source/i.test(title)) return 2;
    if (/restaurant|travel|city|itinerary/i.test(title)) return 0;
    return 1;
}

export function makeTask(title, progress = 0, source = taskSource(title)) {
    return { id: crypto.randomUUID(), title, source, progress, status: progress === stages.length ? "done" : "running", notes: [] };
}

export function taskReport(task) {
    const examples = /restaurant/i.test(task.title)
        ? [["Juniper Table", "A fictional neighborhood bistro with a seasonal menu."], ["Harbor Room", "A fictional waterfront spot suited to a quiet dinner."], ["Olive & Stone", "A fictional casual restaurant for a small group."]]
        : /city|itinerary/i.test(task.title)
          ? [["Day 1", "Start at the local museum, then take the riverside walk."], ["Day 2", "Visit the independent bookshop and leave the afternoon open."]]
          : siteEntries[task.source].slice(0, 3);
    return "# " + task.title + "\n\nSimulated result using local sample data.\n\n" +
        examples.map(([heading, body]) => "## " + heading + "\n" + body).join("\n\n");
}
