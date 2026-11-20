import React, { useState } from "react";
import {
    ArrowLeft, ArrowRight, BookOpen, Check, FileText, GitCompareArrows, ListChecks, Search,
} from "lucide-react";
import "./agent-skills.css";

const skills = [
    {
        id: "web-research",
        name: "Web Research",
        icon: Search,
        description: "Collect sources and compare findings.",
        tags: ["Research", "Browser"],
        steps: ["Open the local research sources", "Compare the example papers", "Save a brief with source links"],
        prompt: "Research generative AI in education using the sample papers and save a reading brief.",
    },
    {
        id: "news-digest",
        name: "News Digest",
        icon: BookOpen,
        description: "Turn a list of stories into a short digest.",
        tags: ["Browser", "Writing"],
        steps: ["Open the sample Hacker News feed", "Pick three stories", "Summarize the discussion on each"],
        prompt: "Summarize three stories from the sample Hacker News feed and highlight the discussions.",
    },
    {
        id: "repository-comparison",
        name: "Repository Comparison",
        icon: GitCompareArrows,
        description: "Compare projects, license terms, and use cases.",
        tags: ["Browser", "Code"],
        steps: ["Open the local GitHub preview", "Read the sample project summaries", "Write a comparison with tradeoffs"],
        prompt: "Compare the sample GitHub repositories by purpose, licensing, and when to choose each one.",
    },
    {
        id: "reading-brief",
        name: "Reading Brief",
        icon: FileText,
        description: "Build a one-page brief from source material.",
        tags: ["Research", "Writing"],
        steps: ["Pick relevant entries from the sample library", "Extract the main points", "Write a one-page Markdown brief"],
        prompt: "Prepare a one-page reading brief from the sample research library, with takeaways and source links.",
    },
    {
        id: "task-checklist",
        name: "Task Checklist",
        icon: ListChecks,
        description: "Turn notes into a checklist with next actions.",
        tags: ["Planning", "Writing"],
        steps: ["Review the sample project notes", "Group the work into a short checklist", "Flag items that need a decision"],
        prompt: "Organize sample project notes into a checklist. Separate next actions from open decisions.",
    },
];

export function AgentSkills({ enabled = [], onToggle, onUse }) {
    const [query, setQuery] = useState("");
    const [selectedOnly, setSelectedOnly] = useState(false);
    const [activeId, setActiveId] = useState(null);
    const active = skills.find((skill) => skill.id === activeId);
    const normalizedQuery = query.trim().toLowerCase();
    const matchingSkills = skills.filter((skill) =>
        (!selectedOnly || enabled.includes(skill.id)) &&
        [skill.name, skill.description, ...skill.tags].join(" ").toLowerCase().includes(normalizedQuery)
    );

    if (active) {
        const Icon = active.icon;
        const selected = enabled.includes(active.id);
        return (
            <section className="agent-skills" aria-label={active.name + " skill"}>
                <button type="button" className="agent-skills-back" onClick={() => setActiveId(null)}>
                    <ArrowLeft size={14} /> All skills
                </button>
                <header className="agent-skill-detail">
                    <div className="agent-skill-mark"><Icon size={18} /></div>
                    <div>
                        <h2>{active.name}</h2>
                        <p>{active.description}</p>
                    </div>
                </header>
                <ul aria-label="Skill categories" className="agent-skill-tags">
                    {active.tags.map((tag) => <li key={tag}>{tag}</li>)}
                </ul>
                <h3>Workflow</h3>
                <ol className="agent-skill-workflow">
                    {active.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <div className="agent-skill-example">
                    <h3>Sample prompt</h3>
                    <p>{active.prompt}</p>
                </div>
                <div className="agent-skill-actions">
                    <button type="button" className="soft" aria-pressed={selected} onClick={() => onToggle(active.id)}>
                        {selected && <Check size={14} />} {selected ? "Selected" : "Select skill"}
                    </button>
                    <button type="button" className="agent-skill-run" onClick={() => onUse(active.prompt)}>
                        Run sample <ArrowRight size={14} />
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className="agent-skills" aria-label="Agent skills">
            <header className="agent-skills-heading">
                <h2>Skills</h2>
                <p>Browse sample workflows or select skills for your workspace.</p>
            </header>
            <label className="agent-skills-search">
                <Search size={15} />
                <input type="search" placeholder="Search skills" aria-label="Search skills" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="agent-skills-filters" aria-label="Skill filter">
                <button type="button" aria-pressed={!selectedOnly} onClick={() => setSelectedOnly(false)}>All</button>
                <button type="button" aria-pressed={selectedOnly} onClick={() => setSelectedOnly(true)}>Selected ({enabled.length})</button>
            </div>
            {matchingSkills.length === 0 && (
                <p className="agent-skills-empty" role="status">
                    {normalizedQuery ? "No matching skills." : "Select a skill to see it here."}
                </p>
            )}
            <ul className="agent-skills-list">
                {matchingSkills.map(({ id, name, description, icon: Icon }) => {
                    const selected = enabled.includes(id);
                    return (
                        <li className="agent-skill-row" key={id}>
                            <button type="button" className="agent-skill-link" aria-label={"View " + name} onClick={() => setActiveId(id)}>
                                <span className="agent-skill-mark"><Icon size={16} /></span>
                                <span><strong>{name}</strong><span>{description}</span></span>
                            </button>
                            <label className="agent-skill-check" title={selected ? "Remove from selected skills" : "Select skill"}>
                                <input type="checkbox" aria-label={"Select " + name} checked={selected} onChange={() => onToggle(id)} />
                            </label>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
